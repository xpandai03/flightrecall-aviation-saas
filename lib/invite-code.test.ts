import { describe, expect, it } from "vitest";

import {
  generateInviteCode,
  isInviteRedeemable,
  isWellFormedInviteCode,
} from "@/lib/invite-code";

describe("invite-code — generation", () => {
  it("is url-safe and high-entropy (>= 16 chars, base64url alphabet)", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeGreaterThanOrEqual(16);
    expect(isWellFormedInviteCode(code)).toBe(true);
  });

  it("is not a short numeric PIN", () => {
    const code = generateInviteCode();
    expect(/^\d{4,8}$/.test(code)).toBe(false);
  });

  it("produces distinct codes across calls (not reused)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBe(50);
  });

  it("rejects malformed/guessable inputs", () => {
    expect(isWellFormedInviteCode("1234")).toBe(false);
    expect(isWellFormedInviteCode("has spaces here xx")).toBe(false);
    expect(isWellFormedInviteCode("N12345")).toBe(false); // a tail number is not a code
    expect(isWellFormedInviteCode("")).toBe(false);
  });
});

describe("invite-code — redeemability (mirrors the SQL predicate)", () => {
  const now = Date.parse("2026-06-11T12:00:00Z");

  it("active (not revoked, no expiry) → redeemable", () => {
    expect(isInviteRedeemable({ revoked_at: null, expires_at: null }, now)).toBe(
      true,
    );
  });

  it("active with a future expiry → redeemable", () => {
    expect(
      isInviteRedeemable(
        { revoked_at: null, expires_at: "2026-06-12T12:00:00Z" },
        now,
      ),
    ).toBe(true);
  });

  it("revoked → NOT redeemable (even if not expired)", () => {
    expect(
      isInviteRedeemable(
        { revoked_at: "2026-06-11T11:00:00Z", expires_at: null },
        now,
      ),
    ).toBe(false);
  });

  it("expired → NOT redeemable", () => {
    expect(
      isInviteRedeemable(
        { revoked_at: null, expires_at: "2026-06-11T11:59:59Z" },
        now,
      ),
    ).toBe(false);
  });

  it("expiry exactly now → NOT redeemable (strict)", () => {
    expect(
      isInviteRedeemable(
        { revoked_at: null, expires_at: "2026-06-11T12:00:00Z" },
        now,
      ),
    ).toBe(false);
  });
});
