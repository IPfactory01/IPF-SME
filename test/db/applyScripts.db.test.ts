import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * The guarded scripts in drizzle/supabase/ are what ET pastes into the Supabase SQL Editor, one per migration. Each must do
 * exactly what `pnpm db:migrate` would: run every statement of its migration, record it with the same hash and date, and
 * refuse to run unless the database is at the migration before it.
 */
const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "drizzle/migrations");
const SCRIPTS = resolve(ROOT, "drizzle/supabase");
const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string; when: number }[] };
const statementsOf = (text: string) => text.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean);
const scriptFor = (idx: number) => readdirSync(SCRIPTS).find(name => name.startsWith(`apply-${String(idx).padStart(4, "0")}-`));

/** A database built from the migrations before `upTo`, recorded as `pnpm db:migrate` records them. */
async function databaseAt(upTo: number) {
  const pg = await PGlite.create();
  await pg.exec('create schema drizzle; create table drizzle."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint);');
  for (const { idx, tag, when } of journal.entries.filter(entry => entry.idx < upTo)) {
    void idx;
    const text = readFileSync(join(MIGRATIONS, `${tag}.sql`), "utf8");
    for (const statement of statementsOf(text)) await pg.exec(statement);
    await pg.query('insert into drizzle."__drizzle_migrations" (hash, created_at) values ($1, $2)', [createHash("sha256").update(text).digest("hex"), when]);
  }
  return pg;
}

describe("the Supabase apply scripts", () => {
  const latest = journal.entries.at(-1)!;

  it("match their migration: every statement, the same hash and date, and a guard on the migration count", () => {
    for (const { idx, tag, when } of journal.entries.filter(entry => entry.idx >= 20)) {
      const name = scriptFor(idx);
      expect(name, `drizzle/supabase/apply-${String(idx).padStart(4, "0")}-*.sql`).toBeTruthy();
      const script = readFileSync(join(SCRIPTS, name!), "utf8");
      const migration = readFileSync(join(MIGRATIONS, `${tag}.sql`), "utf8");
      for (const statement of statementsOf(migration)) expect(script, `${name}: ${statement}`).toContain(statement);
      expect(script).toContain(`values ('${createHash("sha256").update(migration).digest("hex")}', ${when});`);
      expect(script).toContain(`if applied <> ${idx} then`);
    }
  });

  it("apply the latest migration to a database at the one before, and refuse to run twice", async () => {
    const pg = await databaseAt(latest.idx);
    const script = readFileSync(join(SCRIPTS, scriptFor(latest.idx)!), "utf8");
    await pg.exec(script);
    const recorded = await pg.query<{ count: number }>('select count(*)::int as count from drizzle."__drizzle_migrations"');
    expect(recorded.rows[0]!.count).toBe(latest.idx + 1);
    await expect(pg.exec(script)).rejects.toThrow(/Stopped, nothing changed/);
    await pg.close();
  }, 60_000);

  it("0024: the conversation table exists, and only the Digital Marketing footage items take the First edit", async () => {
    const pg = await databaseAt(24);
    await pg.exec(`
      insert into engagements ("contactName", "type") values ('Ada Example', 'digital_marketing'), ('Ben Example', 'business_review');
      insert into engagement_tasks ("engagementId", "kind", "side", "title") values
        (1, 'action', 'client', 'Send week 1 footage'), (1, 'action', 'client', 'Send week 12 footage'), (1, 'action', 'client', 'Approve the first reels'),
        (1, 'action', 'ipf', 'Send week 1 footage'), (2, 'action', 'client', 'Send week 1 footage');
    `);
    await pg.exec(readFileSync(join(SCRIPTS, scriptFor(24)!), "utf8"));
    const tasks = await pg.query<{ id: number; turnaround: string | null }>('select id, turnaround::text as turnaround from engagement_tasks order by id');
    expect(tasks.rows).toEqual([{ id: 1, turnaround: "first_edit" }, { id: 2, turnaround: "first_edit" }, { id: 3, turnaround: null }, { id: 4, turnaround: null }, { id: 5, turnaround: null }]);
    const table = await pg.query<{ count: number }>("select count(*)::int as count from information_schema.columns where table_schema = 'public' and table_name = 'engagement_task_comments'");
    expect(table.rows[0]!.count).toBe(6);
    await pg.close();
  }, 60_000);

  it("0023: every engagement starts paid in advance (paidInArrears false, never empty)", async () => {
    const pg = await databaseAt(23);
    await pg.exec(readFileSync(join(SCRIPTS, scriptFor(23)!), "utf8"));
    const column = await pg.query<{ column_default: string; is_nullable: string }>("select column_default, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'engagements' and column_name = 'paidInArrears'");
    expect(column.rows).toEqual([{ column_default: "false", is_nullable: "NO" }]);
    await pg.close();
  }, 60_000);

  it("0021: the two Digital marketing roles and the three new columns exist", async () => {
    const pg = await databaseAt(21);
    await pg.exec(readFileSync(join(SCRIPTS, scriptFor(21)!), "utf8"));
    const roles = await pg.query<{ value: string }>("select unnest(enum_range(null::engagement_team_role))::text as value");
    expect(roles.rows.map(row => row.value)).toEqual(expect.arrayContaining(["digital_marketer", "content_producer"]));
    const columns = await pg.query<{ table_name: string; column_name: string }>("select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('users', 'engagement_tasks') and column_name in ('whatsapp', 'whatsappConsentAt', 'responseLink') order by table_name, column_name");
    expect(columns.rows.map(row => `${row.table_name}.${row.column_name}`)).toEqual(["engagement_tasks.responseLink", "users.whatsapp", "users.whatsappConsentAt"]);
    await pg.close();
  }, 60_000);

  /**
   * 0022 (the payments ledger, batch F) carries today's payments into the ledger in its own SQL, so the apply script and
   * `pnpm db:migrate` give the same database. Fictional records, written as the code before the ledger writes them.
   */
  describe("0022: the payments ledger", () => {
    const seed = `
      insert into users ("openId", "name") values ('local:ana', 'Ana Example'), ('local:bo', 'Bo Example');
      insert into business_checks ("publicToken", "fullName", "email", "stage", "answersJson") values
        ('check-0022-a', 'Ada Example', 'ada@example.com', 'won', '{}'),
        ('check-0022-b', 'Ben Example', 'ben@example.com', 'lead', '{}');
      insert into payment_requests ("businessCheckId", "item", "amountNaira", "reference", "status", "confirmedAt", "confirmedByUserId", "note") values
        (1, 'full_report', 100000, 'TS-R-000001', 'confirmed', '2026-11-01T10:00:00Z', null, 'TEST: Paid online with Paystack, reference TS-R-000001-1a2b3c4d'),
        (1, 'current_state', 300000, 'TS-CS-000002', 'confirmed', '2026-11-03T23:30:00Z', 2, 'Bank transfer 123'),
        (2, 'full_report', 100000, 'TS-R-000003', 'requested', null, null, null);
      insert into engagements ("contactName") values ('Ada Example');
      insert into engagement_fee_lines ("engagementId", "label", "amount", "dueOn", "paidAt", "paidReference") values
        (1, 'Business Review: half to start', 300000, '2026-11-02', '2026-11-02T09:00:00Z', 'TS-F-000001-aabbccdd'),
        (1, 'Business Review: half on delivery', 300000, null, '2026-11-05T22:30:00Z', null),
        (1, 'Month 2', 470000, '2026-12-02', null, null);
      insert into admin_access_audit_events ("actorUserId", "action", "details") values
        (null, 'engagement_fee_paid_online', '{"engagementId":1,"feeLineId":1,"amount":300000,"via":"paystack","paystackReference":"TS-F-000001-aabbccdd","mode":"test"}'),
        (1, 'engagement_fee_paid', '{"engagementId":1,"feeLineId":2,"paid":true,"amount":300000}'),
        (2, 'engagement_fee_paid', '{"engagementId":1,"feeLineId":12,"paid":true,"amount":300000}');
    `;
    const ledger = async (pg: PGlite) => (await pg.query<Record<string, unknown>>('select "feeLineId", "paymentRequestId", method::text, status::text, amount, "paystackReference", mode::text, "receivedOn"::text as "receivedOn", "receiptNumber", note, "recordedByUserId" from payments order by "receiptNumber"')).rows;

    it("carries each paid fee and confirmed payment request over once, numbered in the order they were paid", async () => {
      const pg = await databaseAt(22);
      await pg.exec(seed);
      await pg.exec(readFileSync(join(SCRIPTS, scriptFor(22)!), "utf8"));
      expect(await ledger(pg)).toEqual([
        // The Full Report on Paystack's test keys: its reference and mode come from its note.
        { feeLineId: null, paymentRequestId: 1, method: "paystack", status: "paid", amount: 100000, paystackReference: "TS-R-000001-1a2b3c4d", mode: "test", receivedOn: "2026-11-01", receiptNumber: 1, note: null, recordedByUserId: null },
        // A fee paid on Paystack: its reference from the fee, its mode from the audit row.
        { feeLineId: 1, paymentRequestId: null, method: "paystack", status: "paid", amount: 300000, paystackReference: "TS-F-000001-aabbccdd", mode: "test", receivedOn: "2026-11-02", receiptNumber: 2, note: null, recordedByUserId: null },
        // Confirmed by hand at 23:30 UTC: the 4th in Lagos; the team's note and who confirmed it are kept.
        { feeLineId: null, paymentRequestId: 2, method: "other", status: "paid", amount: 300000, paystackReference: null, mode: null, receivedOn: "2026-11-04", receiptNumber: 3, note: "Bank transfer 123", recordedByUserId: 2 },
        // A fee ticked Paid: who ticked it comes from the audit row for that fee, never a fee with a longer id.
        { feeLineId: 2, paymentRequestId: null, method: "other", status: "paid", amount: 300000, paystackReference: null, mode: null, receivedOn: "2026-11-05", receiptNumber: 4, note: "Marked paid before the ledger", recordedByUserId: 1 },
      ]);
      const invoices = await pg.query<{ id: number; invoiceNumber: number | null }>('select id, "invoiceNumber" from engagement_fee_lines order by id');
      expect(invoices.rows).toEqual([{ id: 1, invoiceNumber: 1 }, { id: 2, invoiceNumber: 2 }, { id: 3, invoiceNumber: null }]);
      const counters = await pg.query<{ kind: string; lastNumber: number }>('select kind::text as kind, "lastNumber" from document_counters order by 1');
      expect(counters.rows).toEqual([{ kind: "invoice", lastNumber: 2 }, { kind: "receipt", lastNumber: 4 }]);
      await pg.close();
    }, 60_000);

    it("adds nothing when the carry-over runs again", async () => {
      const pg = await databaseAt(22);
      await pg.exec(seed);
      await pg.exec(readFileSync(join(SCRIPTS, scriptFor(22)!), "utf8"));
      const before = await ledger(pg);
      const statements = statementsOf(readFileSync(join(MIGRATIONS, `${journal.entries[22]!.tag}.sql`), "utf8"));
      for (const statement of statements.filter(text => /^-- |^UPDATE |^INSERT INTO "document_counters"/.test(text))) await pg.exec(statement);
      expect(await ledger(pg)).toEqual(before);
      const counters = await pg.query<{ lastNumber: number }>('select "lastNumber" from document_counters order by kind::text');
      expect(counters.rows.map(row => row.lastNumber)).toEqual([2, 4]);
      await pg.close();
    }, 60_000);

    it("refuses a payment with two owners or none, a zero amount, and removing a fee that has a payment", async () => {
      const pg = await databaseAt(22);
      await pg.exec(seed);
      await pg.exec(readFileSync(join(SCRIPTS, scriptFor(22)!), "utf8"));
      const code = (statement: string) => pg.exec(statement).then(() => null, (error: { code?: string }) => error.code);
      expect(await code(`insert into payments ("feeLineId", "paymentRequestId", method, amount) values (3, 1, 'other', 1000)`)).toBe("23514");
      expect(await code(`insert into payments (method, amount) values ('other', 1000)`)).toBe("23514");
      expect(await code(`insert into payments ("feeLineId", method, amount) values (3, 'other', 0)`)).toBe("23514");
      expect(await code(`insert into payments ("feeLineId", method, amount, "receiptNumber") values (3, 'other', 1000, 4)`)).toBe("23505");
      // Why 0022 waits for the ledger code: today's Save the fees deletes and re-adds every fee.
      expect(await code(`delete from engagement_fee_lines where "engagementId" = 1`)).toBe("23503");
      await pg.close();
    }, 60_000);
  });
});
