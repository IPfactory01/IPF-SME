import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export const LEGACY_CLOSED_MESSAGE = "This JUMP programme form is closed.";

/**
 * Refuses a JUMP-era public procedure unless LEGACY_JUMP_ENABLED is on. Called first, before any database or provider
 * work, so a closed form costs nothing and sends nothing.
 */
export function requireLegacyJump() {
  if (!ENV.legacyJumpEnabled) throw new TRPCError({ code: "FORBIDDEN", message: LEGACY_CLOSED_MESSAGE });
}
