/**
 * PostgreSQL persistence contract.
 *
 * Runs against PGlite (a real PostgreSQL build, in process) on every `pnpm test`, and additionally against
 * a real database when TEST_DATABASE_URL is set (`pnpm test:db`). The remote run builds a throwaway schema.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getTableConfig, isPgEnum, type PgEnumColumn, type PgTable } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import * as schema from "../../drizzle/schema";
import { registerSchedulingCapacityTests } from "./schedulingCapacity";
import { pgIdentifier } from "../../scripts/pgIdentifier.mjs";
import { allTables, createPgliteHarness, createRemoteHarness, fixtureRow, insertFixture, pgErrorCode, type DbHarness } from "./harness";

const holder = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://contract:contract@localhost:5432/contract";
  return { current: null as unknown as Record<string, unknown> };
});
const mocked = vi.hoisted(() => ({
  deliverEmail: vi.fn(),
  notifyOwner: vi.fn(),
  createCalendarEvent: vi.fn(),
  participant: { current: null as unknown as Record<string, unknown> },
}));

// Route the application's own getDb() to whichever harness is active, so real production code runs.
vi.mock("pg", () => ({ default: { Pool: class { on() { return this; } } } }));
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () =>
    new Proxy({}, {
      get: (_target, property) => {
        const value = holder.current[property as string];
        return typeof value === "function" ? value.bind(holder.current) : value;
      },
    }),
}));
vi.mock("@server/email", async importOriginal => ({ ...(await importOriginal<typeof import("@server/email")>()), deliverEmail: mocked.deliverEmail }));
vi.mock("@server/_core/notification", () => ({ notifyOwner: mocked.notifyOwner }));
vi.mock("@server/calendar", () => ({
  createCalendarEvent: mocked.createCalendarEvent,
  getBusyRanges: vi.fn().mockResolvedValue([]),
  isCalendarConfigured: () => false,
}));
vi.mock("@server/participantAuth", async importOriginal => ({
  ...(await importOriginal<typeof import("@server/participantAuth")>()),
  getAuthenticatedParticipant: async () => mocked.participant.current,
}));

import { upsertUser } from "@server/db";
import { setAdminPassword } from "@server/adminSecurity";
import { databaseNow, emailEquals } from "@server/dbHelpers";
import { isDuplicateReminderError } from "@server/scheduledReminder";
import { createParticipantPasswordLink, completeParticipantPassword, signInParticipantWithPassword } from "@server/participantAuth";
import { registrationRouter } from "@server/routers/registration";
import { schedulingRouter } from "@server/routers/scheduling";
import { ENGAGEMENT_BRIEF_VERSION } from "@shared/engagementBrief";
import type { TrpcContext } from "@server/_core/context";

// A real remote database costs one network round trip (~150 ms) per statement, so application-flow tests need a
// realistic ceiling there. Local targets keep the default 5 s so slowness is still caught; a genuine hang still fails.
const REMOTE_TEST_TIMEOUT_MS = 30_000;
const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: REMOTE_TEST_TIMEOUT_MS, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

const expectedTableNames = allTables.map(table => getTableConfig(table).name).sort();
const enums = (Object.values(schema) as unknown[]).filter(isPgEnum);
const attention = [
  "business_checks", "registrations", "users", "admin_credentials", "participant_credentials", "participant_password_tokens",
  "participant_auth_tokens", "schedule_slots", "schedule_bookings", "scheduled_reminder_deliveries",
  "participant_programme_records", "participant_payment_receipts", "current_status_assessments", "consulting_reports",
];

function tableByName(name: string) {
  return allTables.find(table => getTableConfig(table).name === name)!;
}

for (const target of targets) {
  describe.skipIf(!target.enabled)(`PostgreSQL contract on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
    }, 60_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
      mocked.notifyOwner.mockResolvedValue(true);
      mocked.createCalendarEvent.mockResolvedValue({ status: "Created", eventId: "evt-1" });
    });

    describe("schema", () => {
      it("creates exactly the 50 expected tables", async () => {
        const rows = await harness.query(sql`select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE'`);
        const created = rows.map(row => String(row.table_name)).sort();
        // 30 from the MySQL migration + user_credentials, user_sessions, businesses, business_memberships, client_onboarding_invitations, user_platform_roles, payment_requests, full_reports,
        // and the engagement room (0008): engagements, engagement_team, engagement_sessions, engagement_tasks, engagement_deliverables, engagement_files, engagement_comments,
        // engagement_measures, engagement_checkins, business_member_access, account_invitations, and debriefs (0009).
        expect(expectedTableNames).toHaveLength(50);
        expect(expectedTableNames.filter(name => !created.includes(name))).toEqual([]);
        expect(created.filter(name => !expectedTableNames.includes(name))).toEqual([]);
      });

      it("creates every column with the declared type, nullability and default", async () => {
        const rows = await harness.query(sql`select table_name, column_name, data_type, udt_name, is_nullable, column_default, is_identity, character_maximum_length from information_schema.columns where table_schema = current_schema()`);
        const byKey = new Map(rows.map(row => [`${row.table_name}.${row.column_name}`, row]));
        const dataTypes: Record<string, string> = { PgInteger: "integer", PgVarchar: "character varying", PgText: "text", PgTimestamp: "timestamp with time zone", PgEnumColumn: "USER-DEFINED", PgBoolean: "boolean", PgDateString: "date", PgNumeric: "numeric" };
        for (const table of allTables) {
          const config = getTableConfig(table);
          for (const column of config.columns) {
            const key = `${config.name}.${column.name}`;
            const actual = byKey.get(key);
            expect(actual, `${key} exists`).toBeDefined();
            expect(actual!.data_type, `${key} type`).toBe(dataTypes[column.columnType]);
            expect(actual!.is_nullable, `${key} nullability`).toBe(column.notNull ? "NO" : "YES");
            if (column.columnType === "PgEnumColumn") expect(actual!.udt_name).toBe((column as PgEnumColumn<never>).enum.enumName);
            if (column.columnType === "PgVarchar") expect(actual!.character_maximum_length).toBe((column as unknown as { length: number }).length);
            if (column.generatedIdentity) expect(actual!.is_identity, `${key} identity`).toBe("YES");
            else if (column.hasDefault) expect(actual!.column_default, `${key} default`).not.toBeNull();
          }
          expect(rows.filter(row => row.table_name === config.name)).toHaveLength(config.columns.length);
        }
      });

      it("gives every table an identity primary key and exactly its declared unique constraints (single and composite)", async () => {
        const rows = await harness.query(sql`select tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema where tc.table_schema = current_schema() and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')`);
        const grouped = (table: string, type: string) => {
          const byConstraint = new Map<string, string[]>();
          for (const row of rows.filter(entry => entry.table_name === table && entry.constraint_type === type)) {
            byConstraint.set(String(row.constraint_name), [...(byConstraint.get(String(row.constraint_name)) ?? []), String(row.column_name)]);
          }
          return [...byConstraint.values()].map(columns => columns.sort().join("+")).sort();
        };
        for (const table of allTables) {
          const config = getTableConfig(table);
          expect(grouped(config.name, "PRIMARY KEY"), `${config.name} primary key`).toEqual(["id"]);
          const declared = [
            ...config.columns.filter(column => column.isUnique).map(column => column.name),
            ...config.uniqueConstraints.map(constraint => constraint.columns.map(column => column.name).sort().join("+")),
          ].sort();
          expect(grouped(config.name, "UNIQUE"), `${config.name} unique constraints`).toEqual(declared);
        }
      });

      it("enforces case-insensitive email uniqueness on users with a unique index", async () => {
        await db.insert(schema.users).values({ openId: "ci-1", email: "Mixed.Case@Example.test" });
        const failure = await db.insert(schema.users).values({ openId: "ci-2", email: "mixed.case@example.test" }).then(() => null, (error: unknown) => error);
        expect(pgErrorCode(failure)).toBe("23505");
        await db.insert(schema.users).values({ openId: "ci-3", email: null });
        await db.insert(schema.users).values({ openId: "ci-4", email: null });
      });

      it("creates every declared foreign key with its declared delete behaviour, under the name PostgreSQL stores", async () => {
        const rows = await harness.query(sql`select k.conname, k.confdeltype, c.relname as child, p.relname as parent, (select array_agg(a.attname::text order by a.attnum) from pg_attribute a where a.attrelid = k.conrelid and a.attnum = any(k.conkey)) as columns from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid join pg_namespace n on n.oid = c.relnamespace where k.contype = 'f' and n.nspname = current_schema()`);
        const stored = new Map(rows.map(row => [String(row.conname), row]));
        const deleteCode: Record<string, string> = { cascade: "c", "no action": "a", restrict: "r", "set null": "n", "set default": "d" };
        let declared = 0;
        for (const table of allTables) {
          const config = getTableConfig(table);
          for (const foreignKey of config.foreignKeys) {
            declared += 1;
            const reference = foreignKey.reference();
            const row = stored.get(pgIdentifier(foreignKey.getName()));
            expect(row, `${foreignKey.getName()} exists as ${pgIdentifier(foreignKey.getName())}`).toBeDefined();
            expect(row!.child).toBe(config.name);
            expect(row!.parent).toBe(getTableConfig(reference.foreignTable as PgTable).name);
            expect(row!.columns).toEqual(reference.columns.map(column => column.name));
            expect(row!.confdeltype, `${foreignKey.getName()} delete rule`).toBe(deleteCode[foreignKey.onDelete ?? "no action"]);
          }
        }
        expect(declared).toBe(rows.length); // no foreign key exists that the schema does not declare
        expect(declared).toBe(53);
      });

      it("stores a declared name longer than 63 bytes truncated, which is why lookups must use pgIdentifier", async () => {
        const declared = getTableConfig(schema.clientOnboardingInvitations).foreignKeys.map(foreignKey => foreignKey.getName());
        const tooLong = declared.filter(name => Buffer.byteLength(name) > 63);
        expect(tooLong).toEqual(["client_onboarding_invitations_businessCheckId_business_checks_id_fk"]);
        const rows = await harness.query(sql`select k.conname from pg_constraint k join pg_namespace n on n.oid = k.connamespace where n.nspname = current_schema() and k.contype = 'f' and k.conname like 'client_onboarding_invitations_businessCheckId%'`);
        expect(rows.map(row => row.conname)).toEqual(["client_onboarding_invitations_businessCheckId_business_checks_i"]); // scoped to this schema: a real database also holds the migrated public schema
        expect(pgIdentifier(tooLong[0])).toBe("client_onboarding_invitations_businessCheckId_business_checks_i");
        expect(pgIdentifier("short_name")).toBe("short_name");
      });

      it("enforces the onboarding invitation's business check, and refuses to delete a check an invitation depends on", async () => {
        const [admin] = await db.insert(schema.users).values({ openId: "fk-invite-admin" }).returning();
        const [check] = await db.insert(schema.businessChecks).values(fixtureRow(schema.businessChecks, { publicToken: "fk-invite-check-1" })).returning();
        const invitation = (businessCheckId: number, hash: string) => ({ businessCheckId, email: "fk@example.test", fullNameSnapshot: "x", businessNameSnapshot: "x", tokenHash: hash.padEnd(64, "0"), expiresAt: new Date(Date.now() + 60_000), createdByUserId: admin.id });

        // The referenced business check is enforced...
        const orphan = await db.insert(schema.clientOnboardingInvitations).values(invitation(2_000_000_000, "orphan")).then(() => null, (error: unknown) => error);
        expect(pgErrorCode(orphan)).toBe("23503");

        // ...and NO ACTION means a lead that has an invitation cannot be deleted out from under that security record.
        await db.insert(schema.clientOnboardingInvitations).values(invitation(check.id, "kept"));
        const blocked = await db.delete(schema.businessChecks).where(eq(schema.businessChecks.id, check.id)).then(() => null, (error: unknown) => error);
        expect(pgErrorCode(blocked)).toBe("23503");
        expect(await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.id, check.id))).toHaveLength(1);
        expect(await db.select().from(schema.clientOnboardingInvitations).where(eq(schema.clientOnboardingInvitations.businessCheckId, check.id))).toHaveLength(1);

        // A lead with no invitation is still deletable: the rule only protects checks that have one.
        const [lonely] = await db.insert(schema.businessChecks).values(fixtureRow(schema.businessChecks, { publicToken: "fk-invite-check-2" })).returning();
        await db.delete(schema.businessChecks).where(eq(schema.businessChecks.id, lonely.id));
        expect(await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.id, lonely.id))).toHaveLength(0);
      });

      it("declares a foreign key from every account table and cascades deletes of a user", async () => {
        const [user] = await db.insert(schema.users).values({ openId: "fk-cascade" }).returning();
        const [business] = await db.insert(schema.businesses).values({ name: "FK Co", slug: "fk-co-1", createdByUserId: user.id }).returning();
        await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash: "x" });
        await db.insert(schema.userSessions).values({ userId: user.id, tokenHash: "f".repeat(64), expiresAt: new Date() });
        await db.insert(schema.businessMemberships).values({ businessId: business.id, userId: user.id, role: "owner" });
        // A business created by a user blocks deleting that user (no silent loss of a workspace)...
        const blocked = await db.delete(schema.users).where(eq(schema.users.id, user.id)).then(() => null, (error: unknown) => error);
        expect(pgErrorCode(blocked)).toBe("23503");
        // ...but deleting the business first lets the user's credential, sessions and memberships cascade away.
        await db.delete(schema.businesses).where(eq(schema.businesses.id, business.id));
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
        expect(await db.select().from(schema.userCredentials).where(eq(schema.userCredentials.userId, user.id))).toHaveLength(0);
        expect(await db.select().from(schema.userSessions).where(eq(schema.userSessions.userId, user.id))).toHaveLength(0);
        expect(await db.select().from(schema.businessMemberships).where(eq(schema.businessMemberships.userId, user.id))).toHaveLength(0);
      });

      it("creates all 69 enum types with their exact labels in order", async () => {
        const rows = await harness.query(sql`select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace where n.nspname = current_schema() group by t.typname`);
        const actual = new Map(rows.map(row => [String(row.typname), row.labels as string[]]));
        expect(enums).toHaveLength(70);
        for (const definition of enums) expect(actual.get(definition.enumName), definition.enumName).toEqual([...definition.enumValues]);
        expect(actual.size).toBe(enums.length);
      });

      it("rejects values outside an enum", async () => {
        await expect(db.insert(schema.users).values({ openId: "bad-enum", role: "owner" as never })).rejects.toSatisfy((error: unknown) => pgErrorCode(error) === "22P02");
      });
    });

    describe("INSERT / SELECT / UPDATE / DELETE / RETURNING on every table", () => {
      it.each(expectedTableNames)("%s", async name => {
        const table = tableByName(name) as PgTable;
        const config = getTableConfig(table);
        const t = table as unknown as Record<string, never>;
        const inserted = await insertFixture(db, table) as { id: number };
        expect(inserted.id).toEqual(expect.any(Number));
        const selected = await db.select().from(table).where(eq(t.id, inserted.id));
        expect(selected).toHaveLength(1);

        const editable = config.columns.find(column => !column.isUnique && !column.primary && column.notNull && ["PgText", "PgVarchar"].includes(column.columnType));
        if (editable) {
          const [updated] = await db.update(table).set({ [editable.name]: "updated" } as never).where(eq(t.id, inserted.id)).returning();
          expect(updated[editable.name]).toBe("updated");
        }
        const deleted = await db.delete(table).where(eq(t.id, inserted.id)).returning({ id: t.id });
        expect(deleted).toEqual([{ id: inserted.id }]);
        expect(await db.select().from(table).where(eq(t.id, inserted.id))).toHaveLength(0);
      });

      it("keeps the attention tables in the verified set", () => {
        expect(attention.filter(name => !expectedTableNames.includes(name))).toEqual([]);
      });
    });

    describe("unique constraints and error codes", () => {
      it("raises 23505 for a duplicate and the reminder code recognises it", async () => {
        const values = fixtureRow(schema.scheduledReminderDeliveries, { deliveryKey: "booking:1:24h" });
        await db.insert(schema.scheduledReminderDeliveries).values(values);
        const failure = await db.insert(schema.scheduledReminderDeliveries).values({ ...values }).then(() => null, (error: unknown) => error);
        expect(failure).not.toBeNull();
        expect(pgErrorCode(failure)).toBe("23505");
        expect(isDuplicateReminderError(failure)).toBe(true);
      });

      it("does not treat other failures as duplicates", () => {
        expect(isDuplicateReminderError(new Error("boom"))).toBe(false);
        expect(isDuplicateReminderError({ code: "ER_DUP_ENTRY", errno: 1062 })).toBe(false);
        expect(isDuplicateReminderError({ cause: { code: "23505" } })).toBe(true);
      });
    });

    describe("transactions", () => {
      it("commits", async () => {
        await db.transaction(async (tx: typeof db) => {
          await tx.insert(schema.users).values({ openId: "tx-commit" });
        });
        expect(await db.select().from(schema.users).where(eq(schema.users.openId, "tx-commit"))).toHaveLength(1);
      });

      it("rolls back when the callback throws", async () => {
        await expect(db.transaction(async (tx: typeof db) => {
          await tx.insert(schema.users).values({ openId: "tx-rollback" });
          throw new Error("abort");
        })).rejects.toThrow("abort");
        expect(await db.select().from(schema.users).where(eq(schema.users.openId, "tx-rollback"))).toHaveLength(0);
      });
    });

    describe("upserts through the real application code", () => {
      it("upsertUser inserts then updates one row and advances updatedAt", async () => {
        await upsertUser({ openId: "upsert-user", name: "First", email: "first@example.test" });
        const [first] = await db.select().from(schema.users).where(eq(schema.users.openId, "upsert-user"));
        await new Promise(resolve => setTimeout(resolve, 15));
        await upsertUser({ openId: "upsert-user", name: "Second" });
        const rows = await db.select().from(schema.users).where(eq(schema.users.openId, "upsert-user"));
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("Second");
        expect(rows[0].email).toBe("first@example.test");
        expect(rows[0].id).toBe(first.id);
        expect(rows[0].updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      });

      it("setAdminPassword upserts one credential per user and advances updatedAt", async () => {
        const [user] = await db.insert(schema.users).values({ openId: "admin-upsert", role: "admin" }).returning();
        await setAdminPassword(user.id, "first-password");
        const [first] = await db.select().from(schema.adminCredentials).where(eq(schema.adminCredentials.userId, user.id));
        await new Promise(resolve => setTimeout(resolve, 15));
        await setAdminPassword(user.id, "second-password");
        const rows = await db.select().from(schema.adminCredentials).where(eq(schema.adminCredentials.userId, user.id));
        expect(rows).toHaveLength(1);
        expect(rows[0].passwordHash).not.toBe(first.passwordHash);
        expect(rows[0].updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      });

      it("the inbound reply upsert keys on mailboxMessageId and refreshes updatedAt", async () => {
        const [registration] = await db.insert(schema.registrations).values(fixtureRow(schema.registrations)).returning();
        const reply = fixtureRow(schema.inboundEmailReplies, { registrationId: registration.id, mailboxMessageId: "message-1", preview: "one" });
        await db.insert(schema.inboundEmailReplies).values(reply);
        const [before] = await db.select().from(schema.inboundEmailReplies).where(eq(schema.inboundEmailReplies.mailboxMessageId, "message-1"));
        await new Promise(resolve => setTimeout(resolve, 15));
        await db.insert(schema.inboundEmailReplies).values({ ...reply, preview: "two" }).onConflictDoUpdate({
          target: schema.inboundEmailReplies.mailboxMessageId,
          set: { updatedAt: databaseNow(), preview: "two" },
        });
        const rows = await db.select().from(schema.inboundEmailReplies).where(eq(schema.inboundEmailReplies.mailboxMessageId, "message-1"));
        expect(rows).toHaveLength(1);
        expect(rows[0].preview).toBe("two");
        expect(rows[0].updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      });
    });

    describe("case sensitivity and updatedAt", () => {
      it("matches a stored mixed-case email only through emailEquals", async () => {
        await db.insert(schema.users).values({ openId: "case-admin", email: "Admin.Person@Example.test", role: "admin" });
        expect(await db.select().from(schema.users).where(eq(schema.users.email, "admin.person@example.test"))).toHaveLength(0);
        const found = await db.select().from(schema.users).where(and(emailEquals(schema.users.email, "  Admin.Person@EXAMPLE.test "), eq(schema.users.role, "admin")));
        expect(found).toHaveLength(1);
      });

      // Only meaningful where the database has its own clock: PGlite takes its time from the same JS clock.
      it.skipIf(target.name === "PGlite")("updatedAt never moves backwards when the application clock lags the database", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
          const real = Date.now();
          vi.setSystemTime(real - 120_000); // application clock two minutes behind
          const [row] = await db.insert(schema.users).values({ openId: `skew-${real}` }).returning();
          await upsertUser({ openId: row.openId, name: "skewed" });
          const [afterUpsert] = await db.select().from(schema.users).where(eq(schema.users.id, row.id));
          const [afterUpdate] = await db.update(schema.users).set({ name: "skewed again" }).where(eq(schema.users.id, row.id)).returning();
          expect(afterUpsert.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime());
          expect(afterUpdate.updatedAt.getTime()).toBeGreaterThanOrEqual(afterUpsert.updatedAt.getTime());
        } finally {
          vi.useRealTimers();
        }
      });

      it("advances updatedAt on an ordinary Drizzle update (replaces MySQL ON UPDATE CURRENT_TIMESTAMP)", async () => {
        const [row] = await db.insert(schema.users).values({ openId: "on-update" }).returning();
        await new Promise(resolve => setTimeout(resolve, 15));
        const [updated] = await db.update(schema.users).set({ name: "Changed" }).where(eq(schema.users.id, row.id)).returning();
        expect(updated.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
      });
    });

    describe("participant password flow", () => {
      it("sets a password with RETURNING-based token ids, signs in case-insensitively and upserts on reset", async () => {
        const [registration] = await db.insert(schema.registrations).values(fixtureRow(schema.registrations, { email: "Person@Example.test", status: "Accepted" })).returning();
        const req = { protocol: "https", headers: {} } as TrpcContext["req"];
        const cookies: string[] = [];
        const ctx = { req, res: { cookie: (name: string) => cookies.push(name) }, user: null } as unknown as TrpcContext;

        const setup = await createParticipantPasswordLink(registration.id, req);
        expect(setup.purpose).toBe("setup");
        expect(setup.tokenId).toEqual(expect.any(Number));
        const token = new URL(setup.passwordUrl).searchParams.get("token") ?? setup.passwordUrl.split("/").pop()!;
        await completeParticipantPassword(ctx, { token, password: "first-password", confirmPassword: "first-password" });

        await signInParticipantWithPassword(ctx, "  person@EXAMPLE.test ", "first-password");
        expect(cookies.length).toBeGreaterThanOrEqual(2);

        const reset = await createParticipantPasswordLink(registration.id, req);
        expect(reset.purpose).toBe("reset");
        const resetToken = new URL(reset.passwordUrl).searchParams.get("token") ?? reset.passwordUrl.split("/").pop()!;
        await completeParticipantPassword(ctx, { token: resetToken, password: "second-password", confirmPassword: "second-password" });
        const credentials = await db.select().from(schema.participantCredentials).where(eq(schema.participantCredentials.registrationId, registration.id));
        expect(credentials).toHaveLength(1);
        await expect(signInParticipantWithPassword(ctx, "person@example.test", "first-password")).rejects.toBeInstanceOf(TRPCError);
        await signInParticipantWithPassword(ctx, "person@example.test", "second-password");
      });
    });

    describe("registration.submit", () => {
      it("stores one registration and links its email audit entry using the returned id", async () => {
        const caller = registrationRouter.createCaller({ req: { protocol: "https", headers: {} }, res: {}, user: null } as unknown as TrpcContext);
        await caller.submit({
          fullName: "Contract Test", email: "contract@example.test", phone: "+234 800 000 0000", businessName: "Contract Business",
          businessDescription: "A controlled test of registration persistence on PostgreSQL.", businessModel: "Expert", package: "Foundation",
          question: "Does registration persist?",
        });
        const rows = await db.select().from(schema.registrations).where(eq(schema.registrations.email, "contract@example.test"));
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe("Pending");
        const logs = await db.select().from(schema.emailLogs).where(eq(schema.emailLogs.registrationId, rows[0].id));
        expect(logs).toHaveLength(1);
      });
    });

    describe("scheduling.book", () => {
      async function bookingSetup(capacity: number, suffix: string) {
        const [registration] = await db.insert(schema.registrations).values(fixtureRow(schema.registrations, {
          email: `booker-${suffix}@example.test`, status: "Accepted", depositPaid: "Paid", package: "Foundation",
        })).returning();
        await db.insert(schema.participantEngagementConsents).values(fixtureRow(schema.participantEngagementConsents, {
          registrationId: registration.id, briefVersion: ENGAGEMENT_BRIEF_VERSION,
        }));
        const [slot] = await db.insert(schema.scheduleSlots).values(fixtureRow(schema.scheduleSlots, {
          kind: "Learn", capacity, bookedCount: 0, status: "Open", startAt: new Date("2030-01-01T10:00:00Z"), endAt: new Date("2030-01-01T11:00:00Z"),
        })).returning();
        return { registration, slot };
      }
      const callerFor = (registration: Record<string, unknown>) => {
        mocked.participant.current = registration;
        return schedulingRouter.createCaller({ req: { protocol: "https", headers: {} }, res: {}, user: null } as unknown as TrpcContext);
      };

      it("claims the slot atomically, returns the booking id and fills a capacity-1 slot", async () => {
        const { registration, slot } = await bookingSetup(1, "full");
        const result = await callerFor(registration).book({ slotId: slot.id });
        expect(result.success).toBe(true);
        const [booking] = await db.select().from(schema.scheduleBookings).where(eq(schema.scheduleBookings.id, result.bookingId));
        expect(booking).toMatchObject({ registrationId: registration.id, slotId: slot.id, status: "Confirmed" });
        const [after] = await db.select().from(schema.scheduleSlots).where(eq(schema.scheduleSlots.id, slot.id));
        expect(after).toMatchObject({ bookedCount: 1, status: "Booked" });

        const other = await bookingSetup(1, "second");
        await expect(callerFor(other.registration).book({ slotId: slot.id })).rejects.toMatchObject({ code: "CONFLICT" });
      });

      it("keeps a capacity-2 slot open after its first booking", async () => {
        const { registration, slot } = await bookingSetup(2, "open");
        await callerFor(registration).book({ slotId: slot.id });
        const [after] = await db.select().from(schema.scheduleSlots).where(eq(schema.scheduleSlots.id, slot.id));
        expect(after).toMatchObject({ bookedCount: 1, status: "Open" });
      });

      registerSchedulingCapacityTests({
        getDb: () => db,
        book: async (registration, slotId) => callerFor(registration).book({ slotId }),
      });

      it("rolls back the booking transaction when the slot can no longer be claimed", async () => {
        const { registration, slot } = await bookingSetup(1, "race");
        // Simulate a competing claim between the read and the guarded update.
        await db.update(schema.scheduleSlots).set({ bookedCount: 1 }).where(and(eq(schema.scheduleSlots.id, slot.id)));
        await expect(callerFor(registration).book({ slotId: slot.id })).rejects.toMatchObject({ code: "CONFLICT" });
        expect(await db.select().from(schema.scheduleBookings).where(eq(schema.scheduleBookings.slotId, slot.id))).toHaveLength(0);
      });
    });
  });
}
