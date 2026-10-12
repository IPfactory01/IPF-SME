// Read-only verification of the PostgreSQL schema against the committed Drizzle baseline.
//   pnpm db:verify            (loads .env if present)
//   node --env-file=.env scripts/dbVerify.mjs
//
// Uses MIGRATION_DATABASE_URL. Only SELECT statements run, inside a READ ONLY transaction. Prints schema metadata and
// PASS/FAIL only: never the connection string, credentials or any row data.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { pgIdentifier } from "./pgIdentifier.mjs";

const root = process.cwd();
const MIGRATIONS = resolve(root, "drizzle/migrations");
const SCHEMA = "public";

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });
const line = text => console.log(text);
const list = (label, items) => line(`${label} (${items.length}): ${items.length ? items.join(", ") : "-"}`);

// Critical columns beyond every primary and unique key.
const CRITICAL = {
  users: ["openId", "role", "email", "status"],
  user_credentials: ["userId", "passwordHash", "failedAttempts", "lockedUntil"],
  user_sessions: ["userId", "tokenHash", "expiresAt", "revokedAt"],
  businesses: ["name", "slug", "status", "createdByUserId"],
  business_memberships: ["businessId", "userId", "role", "status"],
  registrations: ["email", "status", "package", "depositPaid", "bookingToken"],
  business_checks: ["publicToken", "pipelineStage", "answersJson", "resultJson", "summaryJson", "callRequestedAt", "reportRequestedAt", "completedAt"],
  schedule_slots: ["bookedCount", "capacity", "status"],
  schedule_bookings: ["registrationId", "slotId", "status"],
  scheduled_reminder_deliveries: ["deliveryKey"],
  participant_credentials: ["registrationId", "passwordHash"],
  admin_credentials: ["userId", "passwordHash"],
};

// ---- expected metadata, from the committed Drizzle snapshot and journal (no database access) ----
const journal = JSON.parse(readFileSync(resolve(MIGRATIONS, "meta/_journal.json"), "utf8"));
const snapshotFiles = readdirSync(resolve(MIGRATIONS, "meta")).filter(file => file.endsWith("_snapshot.json")).sort();
const snapshot = JSON.parse(readFileSync(resolve(MIGRATIONS, "meta", snapshotFiles.at(-1)), "utf8"));
// Drizzle records the default (public) schema as an empty string on tables.
const expectedTables = Object.values(snapshot.tables).filter(table => (table.schema || SCHEMA) === SCHEMA);
const expectedEnums = Object.values(snapshot.enums).filter(entry => entry.schema === SCHEMA);
const expectedTableNames = expectedTables.map(table => table.name).sort();
const expectedEnumNames = expectedEnums.map(entry => entry.name).sort();

function expectedColumnType(column) {
  if (column.typeSchema) return { dataType: "USER-DEFINED", udt: column.type };
  const varchar = /^varchar\((\d+)\)$/.exec(column.type);
  if (varchar) return { dataType: "character varying", length: Number(varchar[1]) };
  const numeric = /^numeric\((\d+)(?:,\s*(\d+))?\)$/.exec(column.type);
  if (numeric) return { dataType: "numeric", precision: Number(numeric[1]), scale: Number(numeric[2] ?? 0) };
  return { dataType: column.type };
}
const actualColumnType = row =>
  row.data_type === "numeric" && row.numeric_precision != null ? `numeric(${row.numeric_precision}, ${row.numeric_scale ?? 0})` : `${row.data_type}${row.udt_name ? `/${row.udt_name}` : ""}`;
// Git stores the migrations with LF line endings; a Windows checkout may rewrite them as CRLF. drizzle-kit hashed the LF
// text, so the line endings are normalised before hashing, and any other difference in a file still fails the check.
const migrationHash = text => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const normaliseDefault = value => (value == null ? null : String(value).replace(/::[\w\s."]+(\[\])?/g, "").replace(/^\((.*)\)$/, "$1").trim());

// ---- connection ----
function poolConfig(connectionString) {
  const url = new URL(connectionString);
  const isLocal = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  for (const parameter of ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(parameter);
  const ca = process.env.DATABASE_SSL_CA?.trim();
  return {
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: isLocal ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  };
}

async function main() {
  line("PostgreSQL schema verification (read-only)");
  line(`Schema: ${SCHEMA}`);

  if (!process.env.MIGRATION_DATABASE_URL) {
    line("FAIL: MIGRATION_DATABASE_URL is not set.");
    return false;
  }

  const pool = new pg.Pool(poolConfig(process.env.MIGRATION_DATABASE_URL));
  pool.on("error", () => undefined);
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    // Only the error class is shown; messages can contain host details.
    line(`FAIL: could not connect (${error?.code ?? error?.name ?? "error"}).`);
    await pool.end().catch(() => undefined);
    return false;
  }

  const query = async (text, params = []) => {
    if (!/^\s*select\b/i.test(text)) throw new Error("dbVerify only runs SELECT statements");
    return (await client.query(text, params)).rows;
  };

  try {
    await client.query("BEGIN READ ONLY");

    // ---- tables ----
    const actualTableNames = (await query(
      "select table_name from information_schema.tables where table_schema = $1 and table_type = 'BASE TABLE' order by table_name", [SCHEMA],
    )).map(row => row.table_name);
    const missingTables = expectedTableNames.filter(name => !actualTableNames.includes(name));
    const unexpectedTables = actualTableNames.filter(name => !expectedTableNames.includes(name));
    line("");
    list("Expected tables", expectedTableNames);
    list("Actual tables", actualTableNames);
    list("Missing tables", missingTables);
    list("Unexpected tables", unexpectedTables);
    check(`exactly ${expectedTableNames.length} expected tables defined (from the latest snapshot)`, expectedTableNames.length > 0, `${expectedTableNames.length}`);
    check(`exactly ${expectedTableNames.length} application tables present`, actualTableNames.length === expectedTableNames.length, `${actualTableNames.length}`);
    check("no missing tables", missingTables.length === 0);
    check("no unexpected tables", unexpectedTables.length === 0);

    // ---- enums ----
    const enumRows = await query(
      `select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
         from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = $1 group by t.typname order by t.typname`, [SCHEMA],
    );
    const actualEnumNames = enumRows.map(row => row.name);
    const missingEnums = expectedEnumNames.filter(name => !actualEnumNames.includes(name));
    const unexpectedEnums = actualEnumNames.filter(name => !expectedEnumNames.includes(name));
    line("");
    list("Expected enums", expectedEnumNames);
    list("Actual enums", actualEnumNames);
    list("Missing enums", missingEnums);
    list("Unexpected enums", unexpectedEnums);
    check(`exactly ${expectedEnumNames.length} enum types defined (from the latest snapshot)`, expectedEnumNames.length > 0, `${expectedEnumNames.length}`);
    check(`exactly ${expectedEnumNames.length} enum types present`, actualEnumNames.length === expectedEnumNames.length, `${actualEnumNames.length}`);
    check("no missing enums", missingEnums.length === 0);
    check("no unexpected enums", unexpectedEnums.length === 0);
    const labelMismatches = expectedEnums.filter(entry => {
      const actual = enumRows.find(row => row.name === entry.name);
      return actual && JSON.stringify(actual.labels) !== JSON.stringify(entry.values);
    }).map(entry => entry.name);
    check("enum labels and order match", labelMismatches.length === 0, labelMismatches.join(", "));

    // ---- columns, nullability, defaults, identity ----
    const columnRows = await query(
      `select table_name, column_name, data_type, udt_name, is_nullable, column_default, is_identity, character_maximum_length,
              numeric_precision, numeric_scale
         from information_schema.columns where table_schema = $1`, [SCHEMA],
    );
    const actualColumns = new Map(columnRows.map(row => [`${row.table_name}.${row.column_name}`, row]));
    const failures = { missing: [], type: [], nullability: [], defaults: [], identity: [], extra: [] };
    let columnCount = 0;
    for (const table of expectedTables) {
      const names = Object.keys(table.columns);
      columnCount += names.length;
      for (const extra of columnRows.filter(row => row.table_name === table.name && !names.includes(row.column_name))) failures.extra.push(`${table.name}.${extra.column_name}`);
      for (const column of Object.values(table.columns)) {
        const key = `${table.name}.${column.name}`;
        const actual = actualColumns.get(key);
        if (!actual) { failures.missing.push(key); continue; }
        const type = expectedColumnType(column);
        const typeOk = actual.data_type === type.dataType && (type.udt ? actual.udt_name === type.udt : true) && (type.length ? actual.character_maximum_length === type.length : true) &&
          (type.precision ? actual.numeric_precision === type.precision && actual.numeric_scale === type.scale : true);
        if (!typeOk) failures.type.push(`${key} (expected ${column.type}, found ${actualColumnType(actual)})`);
        if ((actual.is_nullable === "NO") !== Boolean(column.notNull)) failures.nullability.push(`${key} (expected ${column.notNull ? "NOT NULL" : "nullable"})`);
        if (column.identity) {
          if (actual.is_identity !== "YES") failures.identity.push(key);
        } else if (normaliseDefault(column.default) !== normaliseDefault(actual.column_default)) {
          failures.defaults.push(`${key} (expected ${column.default ?? "none"}, found ${actual.column_default ?? "none"})`);
        }
      }
    }
    line("");
    line("Constraint checks");
    line(`  Columns verified: ${columnCount}`);
    check(`all ${columnCount} columns present`, failures.missing.length === 0, failures.missing.join(", "));
    check("no unexpected extra columns", failures.extra.length === 0, failures.extra.join(", "));
    check("column types match", failures.type.length === 0, failures.type.join("; "));
    check("nullability matches", failures.nullability.length === 0, failures.nullability.join("; "));
    check("defaults match", failures.defaults.length === 0, failures.defaults.join("; "));
    check("identity columns match", failures.identity.length === 0, failures.identity.join(", "));

    // ---- primary keys and unique constraints ----
    const constraintRows = await query(
      `select c.relname as table_name, k.contype as kind, array_agg(a.attname::text order by a.attnum) as columns
         from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
        where n.nspname = $1 and k.contype in ('p', 'u') group by c.relname, k.oid, k.contype`, [SCHEMA],
    );
    const pkFailures = [];
    const uniqueFailures = [];
    let uniqueCount = 0;
    for (const table of expectedTables) {
      const actualPk = constraintRows.filter(row => row.table_name === table.name && row.kind === "p").map(row => row.columns.join("+"));
      const expectedPk = Object.values(table.columns).filter(column => column.primaryKey).map(column => column.name).join("+");
      if (actualPk.length !== 1 || actualPk[0] !== expectedPk) pkFailures.push(`${table.name} (expected ${expectedPk || "none"})`);
      const actualUnique = constraintRows.filter(row => row.table_name === table.name && row.kind === "u").map(row => [...row.columns].sort().join("+")).sort();
      const expectedUnique = Object.values(table.uniqueConstraints).map(constraint => [...constraint.columns].sort().join("+")).sort();
      uniqueCount += expectedUnique.length;
      if (JSON.stringify(actualUnique) !== JSON.stringify(expectedUnique)) uniqueFailures.push(`${table.name} (expected ${expectedUnique.join(", ") || "none"}; found ${actualUnique.join(", ") || "none"})`);
    }
    check(`primary keys on all ${expectedTables.length} tables`, pkFailures.length === 0, pkFailures.join("; "));
    check(`all ${uniqueCount} unique constraints match`, uniqueFailures.length === 0, uniqueFailures.join("; "));

    // ---- indexes (including the unique lower(email) index that backs account email uniqueness) and foreign keys ----
    const indexRows = await query("select indexname from pg_indexes where schemaname = $1", [SCHEMA]);
    const actualIndexes = new Set(indexRows.map(row => row.indexname));
    const expectedIndexes = expectedTables.flatMap(table => Object.values(table.indexes ?? {}).map(index => pgIdentifier(index.name)));
    const missingIndexes = expectedIndexes.filter(name => !actualIndexes.has(name));
    check(`all ${expectedIndexes.length} declared indexes present`, missingIndexes.length === 0, missingIndexes.join(", "));
    const foreignKeyRows = await query(
      `select k.conname as name, k.confdeltype as on_delete from pg_constraint k join pg_namespace n on n.oid = k.connamespace where n.nspname = $1 and k.contype = 'f'`, [SCHEMA],
    );
    const actualForeignKeys = new Map(foreignKeyRows.map(row => [row.name, row.on_delete]));
    const deleteCodes = { cascade: "c", "no action": "a", restrict: "r", "set null": "n", "set default": "d" };
    const expectedForeignKeys = expectedTables.flatMap(table => Object.values(table.foreignKeys ?? {}));
    const foreignKeyProblems = expectedForeignKeys.filter(key => actualForeignKeys.get(pgIdentifier(key.name)) !== (deleteCodes[key.onDelete ?? "no action"] ?? "a")).map(key => key.name);
    check(`all ${expectedForeignKeys.length} foreign keys present with the declared delete behaviour`, foreignKeyProblems.length === 0, foreignKeyProblems.join(", "));

    const criticalMissing = [];
    let criticalCount = 0;
    for (const [table, columns] of Object.entries(CRITICAL)) {
      for (const column of columns) {
        criticalCount += 1;
        if (!actualColumns.has(`${table}.${column}`)) criticalMissing.push(`${table}.${column}`);
      }
    }
    check(`${criticalCount} critical columns present`, criticalMissing.length === 0, criticalMissing.join(", "));
    for (const result of results.filter(entry => entry.name.match(/columns present|column types|nullability|defaults|identity|primary keys|unique constraints|critical|extra columns|indexes|foreign keys/))) {
      line(`  ${result.pass ? "PASS" : "FAIL"}  ${result.name}${result.pass || !result.detail ? "" : ` -> ${result.detail}`}`);
    }

    // ---- migration metadata ----
    line("");
    line("Migration metadata check");
    const journalTags = journal.entries.map(entry => entry.tag);
    const sqlFiles = readdirSync(MIGRATIONS).filter(file => file.endsWith(".sql")).map(file => file.replace(/\.sql$/, "")).sort();
    check("journal dialect is postgresql", journal.dialect === "postgresql");
    check("journal entries match the SQL files on disk", JSON.stringify([...journalTags].sort()) === JSON.stringify(sqlFiles), `${journalTags.length} journal / ${sqlFiles.length} files`);
    check("a snapshot exists for each journal entry", snapshotFiles.length === journalTags.length, `${snapshotFiles.length} snapshots`);
    check("snapshot dialect is postgresql", snapshot.dialect === "postgresql");

    const [{ regclass }] = await query("select to_regclass('drizzle.__drizzle_migrations')::text as regclass");
    check("drizzle.__drizzle_migrations exists in the database", Boolean(regclass), regclass ? "" : "migrations have not been applied");
    if (regclass) {
      const applied = await query("select hash, created_at from drizzle.__drizzle_migrations order by id");
      check("applied migration count equals journal entries", applied.length === journal.entries.length, `${applied.length} applied / ${journal.entries.length} expected`);
      const hashMismatches = journal.entries.filter((entry, index) => {
        const file = resolve(MIGRATIONS, `${entry.tag}.sql`);
        const expectedHash = existsSync(file) ? migrationHash(readFileSync(file, "utf8")) : null;
        return !applied[index] || applied[index].hash !== expectedHash || Number(applied[index].created_at) !== entry.when;
      }).map(entry => entry.tag);
      check("applied migration hashes and timestamps match the journal", hashMismatches.length === 0, hashMismatches.join(", "));
    }
    for (const result of results.filter(entry => /journal|snapshot|__drizzle|applied/.test(entry.name))) {
      line(`  ${result.pass ? "PASS" : "FAIL"}  ${result.name}${result.pass || !result.detail ? "" : ` -> ${result.detail}`}`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
  return true;
}

let ran = false;
try {
  ran = await main();
} catch (error) {
  line(`FAIL: verification aborted (${error?.code ?? error?.name ?? "error"}).`);
}

const failed = results.filter(entry => !entry.pass);
line("");
line("Summary");
for (const entry of results) line(`  ${entry.pass ? "PASS" : "FAIL"}  ${entry.name}`);
const overall = ran && failed.length === 0;
line("");
line(`Overall: ${overall ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length} checks passed)`);
process.exit(overall ? 0 : 1);
