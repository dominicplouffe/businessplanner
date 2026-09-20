import { describe, expect, it, vi, beforeEach } from "vitest";

/* The share module talks to the database, so the client is stubbed: what is
   under test is the access rules and the hashing, not Prisma. */
const findUnique = vi.fn();
const create = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    shareLink: { findUnique: (...args: unknown[]) => findUnique(...args) },
    shareView: { create: (...args: unknown[]) => create(...args) },
  },
}));

const { resolveShareToken, recordShareView } = await import("@/lib/share");

const live = {
  id: "s1",
  planId: "p1",
  label: "Meridian Capital",
  revokedAt: null,
  expiresAt: new Date(Date.now() + 86_400_000),
};

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
});

describe("resolveShareToken", () => {
  it("opens a live link", async () => {
    findUnique.mockResolvedValue(live);
    const access = await resolveShareToken("a".repeat(43));
    expect(access).toEqual({
      status: "ok",
      planId: "p1",
      shareLinkId: "s1",
      label: "Meridian Capital",
    });
  });

  it("refuses a revoked link", async () => {
    findUnique.mockResolvedValue({ ...live, revokedAt: new Date() });
    expect((await resolveShareToken("a".repeat(43))).status).toBe("revoked");
  });

  it("refuses an expired link and says when it lapsed", async () => {
    const expiredOn = new Date("2026-01-15T00:00:00Z");
    findUnique.mockResolvedValue({ ...live, expiresAt: expiredOn });
    const access = await resolveShareToken("a".repeat(43));
    expect(access).toEqual({ status: "expired", expiredOn: "2026-01-15" });
  });

  it("opens a link with no expiry", async () => {
    findUnique.mockResolvedValue({ ...live, expiresAt: null });
    expect((await resolveShareToken("a".repeat(43))).status).toBe("ok");
  });

  it("refuses a token too short to be one, without hitting the database", async () => {
    // A guessable token is the whole risk here, so anything that could not
    // have come from 32 bytes of entropy is rejected on sight.
    expect((await resolveShareToken("short")).status).toBe("missing");
    expect((await resolveShareToken("")).status).toBe("missing");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("refuses an unknown token", async () => {
    findUnique.mockResolvedValue(null);
    expect((await resolveShareToken("a".repeat(43))).status).toBe("missing");
  });
});

describe("recordShareView", () => {
  it("counts the reader without keeping their address", async () => {
    await recordShareView({ shareLinkId: "s1", ip: "203.0.113.7", userAgent: "Mozilla/5.0" });
    const data = create.mock.calls[0]?.[0]?.data as { ipHash: string | null };
    expect(data.ipHash).toBeTruthy();
    expect(data.ipHash).not.toContain("203.0.113.7");
    expect(data.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("gives the same reader the same hash and a different one to another", async () => {
    await recordShareView({ shareLinkId: "s1", ip: "203.0.113.7", userAgent: null });
    await recordShareView({ shareLinkId: "s1", ip: "203.0.113.7", userAgent: null });
    await recordShareView({ shareLinkId: "s1", ip: "198.51.100.4", userAgent: null });
    const hashes = create.mock.calls.map((call) => (call[0] as { data: { ipHash: string } }).data.ipHash);
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[2]).not.toBe(hashes[0]);
  });

  it("records a view with no address at all", async () => {
    await recordShareView({ shareLinkId: "s1", ip: null, userAgent: null });
    const data = create.mock.calls[0]?.[0]?.data as { ipHash: string | null };
    expect(data.ipHash).toBeNull();
  });

  it("truncates a hostile user agent rather than storing it whole", async () => {
    await recordShareView({ shareLinkId: "s1", ip: null, userAgent: "x".repeat(5000) });
    const data = create.mock.calls[0]?.[0]?.data as { userAgent: string };
    expect(data.userAgent.length).toBe(400);
  });
});
