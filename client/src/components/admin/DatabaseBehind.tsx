import React, { useEffect, useState } from "react";

type Behind = { missing: string; applied: number; expected: number };

/** What /api/health says about the database's migrations: the first one missing, or null when none is (or it cannot tell). */
export function readBehind(body: unknown): Behind | null {
  const database = (body as { database?: { code?: unknown; migrations?: { missing?: unknown; applied?: unknown; expected?: unknown } } } | null)?.database;
  const migrations = database?.migrations;
  if (database?.code !== "MIGRATION_MISSING" || typeof migrations?.missing !== "string") return null;
  return { missing: migrations.missing, applied: Number(migrations.applied), expected: Number(migrations.expected) };
}

/**
 * The database is behind this version of the site (App flow 7): a migration it needs is not applied, so every screen
 * that reads that migration's tables fails. Shown at the top of Admin, on every tab, from /api/health, until it is
 * applied. Nothing is shown while health cannot be read (the static preview, a network blip): it never guesses.
 */
export default function DatabaseBehind() {
  const [behind, setBehind] = useState<Behind | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch("/api/health", { headers: { accept: "application/json" } });
        const found = readBehind(await response.json());
        if (live) setBehind(found);
      } catch {
        // No answer from health: say nothing rather than guess.
      }
    })();
    return () => { live = false; };
  }, []);
  if (!behind) return null;
  return (
    <section role="alert" aria-label="The database is behind this version of the site" className="border border-danger-line bg-white p-4">
      <div className="space-y-1 border-l-2 border-danger pl-3">
        <h2 className="text-sm font-semibold text-ink">The database is missing migration {behind.missing}</h2>
        <p className="text-xs text-ink-muted">This version of the site needs it ({behind.applied} of {behind.expected} migrations are applied). Until it is, every screen that uses its tables fails. Run the {behind.missing} script from drizzle/supabase in the Supabase SQL Editor of the project the site uses, then reload this page.</p>
      </div>
    </section>
  );
}
