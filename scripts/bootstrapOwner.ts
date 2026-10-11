/**
 * One-time (or deliberate reset) setup of the Super Admin's email-and-password sign-in.
 *
 *   pnpm owner:bootstrap            set the password for the owner in OWNER_ADMIN_EMAIL (or, if one exists, just store
 *                                   the Super Admin role)
 *   pnpm owner:bootstrap --reset    replace an existing password
 *
 * Needs DATABASE_URL and OWNER_ADMIN_EMAIL (read from .env). The password is typed at a hidden prompt: it is never
 * a command-line argument, never an environment variable, never printed and never logged.
 */
import { userCredentials, users } from "../drizzle/schema";
import { bootstrapOwnerCredential, ensureOwnerSuperAdminRole } from "../server/ownerBootstrap";
import { emailEquals } from "../server/dbHelpers";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../server/db";
import { ENV } from "../server/_core/env";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(new Error("Run this in an interactive terminal: the password is typed at a hidden prompt, never piped or passed as an argument."));
      return;
    }
    process.stdout.write(question);
    let value = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const finish = (error?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n" || character === "\u0004") return finish();
        if (character === "\u0003") return finish(new Error("Cancelled."));
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    input.on("data", onData);
  });
}

async function main() {
  const replaceExisting = process.argv.includes("--reset");
  if (!ENV.ownerAdminEmail) throw new Error("OWNER_ADMIN_EMAIL is not set, so there is no owner to set up. Put the Super Admin's sign-in email in .env first.");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not set, so there is no database to update.");
  // An owner who already has a password does not need to type one again: just make sure Super Admin is stored as a role.
  const owner = (await db.select({ id: users.id }).from(users).where(emailEquals(users.email, ENV.ownerAdminEmail)).limit(1))[0];
  const hasPassword = owner ? (await db.select({ id: userCredentials.id }).from(userCredentials).where(eq(userCredentials.userId, owner.id)).limit(1)).length > 0 : false;
  if (hasPassword && !replaceExisting) {
    await ensureOwnerSuperAdminRole(db, { email: ENV.ownerAdminEmail });
    console.log(`The owner (${ENV.ownerAdminEmail}) already has a password. The Super Admin role is stored. Use --reset to replace the password.`);
    return;
  }
  console.log(`Setting the sign-in password for the owner (${ENV.ownerAdminEmail}).`);
  const password = await promptHidden("New password: ");
  const confirmation = await promptHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("The passwords do not match.");
  const result = await bootstrapOwnerCredential(db, { email: ENV.ownerAdminEmail, password, replaceExisting });
  console.log(`Done (${result.action}). Sign in at /admin/login with ${ENV.ownerAdminEmail}.`);
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : "Failed.");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
