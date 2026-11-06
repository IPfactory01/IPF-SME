-- The Shift: apply migration 0020 (paying engagement fees online).
-- Does exactly what `pnpm db:migrate` would: adds two columns, engagement_fee_lines."paidReference" (the Paystack payment
-- that paid a fee) and engagements."opensOnPayment" (false for every existing engagement), and records the migration in
-- drizzle.__drizzle_migrations. Additive only: no data is changed and no existing client's room is affected.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0019. Paste the whole
-- script into the Supabase SQL Editor and press Run. Apply it BEFORE deploying the code that uses it.
-- Generated from drizzle/migrations/0020_engagement_fee_payments.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 20 then
    raise exception 'Stopped, nothing changed: expected 20 recorded migrations (0000 to 0019), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = '17ceb6bafcb971e67db43c9411c1248da0051005c4453f0891d183158b0880e0') then
    raise exception 'Stopped, nothing changed: migration 0019 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'engagements' and column_name = 'opensOnPayment') then
    raise exception 'Stopped, nothing changed: engagements."opensOnPayment" already exists.';
  end if;
end
$guard$;

ALTER TABLE "engagement_fee_lines" ADD COLUMN "paidReference" varchar(64);
ALTER TABLE "engagements" ADD COLUMN "opensOnPayment" boolean DEFAULT false NOT NULL;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('7d212a8969776bfeed77e94f170536a90f4e1a26a8e4280dc5ece2cc62de16a6', 1794003276368);

commit;
