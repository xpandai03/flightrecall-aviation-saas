import { randomBytes } from "node:crypto";

/**
 * Aircraft invite codes — high-entropy, url-safe secrets used for the
 * invite-code join (the ONLY join path; the public tail number never
 * grants access).
 *
 * 16 random bytes → base64url ≈ 22 chars, ~128 bits of entropy: not a
 * guessable PIN. Generated server-side only.
 */
const INVITE_CODE_BYTES = 16;

export function generateInviteCode(): string {
  return randomBytes(INVITE_CODE_BYTES).toString("base64url");
}

/** A url-safe shape check (base64url alphabet), used to reject obviously
 *  malformed input before hitting the DB. Length is bounded generously so
 *  legacy/longer codes still validate. */
export function isWellFormedInviteCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(code);
}

export type InviteValidity = {
  revoked_at: string | null;
  expires_at: string | null;
};

/**
 * Whether an invite is currently redeemable: not revoked and not expired.
 * Pure mirror of the SQL predicate in redeem_aircraft_invite() /
 * uq_aircraft_invites_one_active — used by the GET invite route to decide
 * whether to surface a code as the aircraft's active invite.
 */
export function isInviteRedeemable(
  invite: InviteValidity,
  nowMs: number,
): boolean {
  if (invite.revoked_at !== null) return false;
  if (invite.expires_at !== null && new Date(invite.expires_at).getTime() <= nowMs) {
    return false;
  }
  return true;
}
