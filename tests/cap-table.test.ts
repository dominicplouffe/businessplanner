import { describe, expect, it } from "vitest";
import { priceRound, dilutionPath, type Holder } from "@/lib/finance/cap-table";

const founders: Holder[] = [
  { id: "a", name: "Founder A", shares: 6_000_000, kind: "founder" },
  { id: "b", name: "Founder B", shares: 4_000_000, kind: "founder" },
];

const totalOwnership = (rows: { ownership: number }[]) =>
  rows.reduce((s, r) => s + r.ownership, 0);

describe("priceRound", () => {
  it("prices a simple round and conserves ownership", () => {
    const result = priceRound(founders, { name: "Seed", amount: 2_000_000, preMoneyValuation: 8_000_000 });
    expect(result.postMoneyValuation).toBe(10_000_000);
    // $8M pre over 10M shares = $0.80/share.
    expect(result.pricePerShare).toBeCloseTo(0.8, 10);
    expect(result.newSharesIssued).toBeCloseTo(2_500_000, 6);
    // The investor takes exactly 20% of a $10M post-money company.
    const investor = result.rows.find((r) => r.name === "Seed")!;
    expect(investor.ownership).toBeCloseTo(0.2, 10);
    expect(totalOwnership(result.rows)).toBeCloseTo(1, 10);
  });

  it("dilutes founders pro rata", () => {
    const result = priceRound(founders, { name: "Seed", amount: 2_000_000, preMoneyValuation: 8_000_000 });
    const a = result.rows.find((r) => r.name === "Founder A")!;
    expect(a.priorOwnership).toBeCloseTo(0.6, 10);
    expect(a.ownership).toBeCloseTo(0.48, 10); // 60% × 80%
  });

  it("converts a SAFE at its valuation cap when the cap is the better deal", () => {
    const result = priceRound(
      founders,
      { name: "Series A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s1", name: "SAFE (capped)", amount: 500_000, valuationCap: 5_000_000 }],
    );
    // Round price is $2.00/share; the $5M cap prices the SAFE at $0.50.
    expect(result.pricePerShare).toBeCloseTo(2, 10);
    const conv = result.safeConversions[0]!;
    expect(conv.effectivePrice).toBeCloseTo(0.5, 10);
    expect(conv.shares).toBeCloseTo(1_000_000, 6);
    expect(totalOwnership(result.rows)).toBeCloseTo(1, 10);
  });

  it("converts a SAFE at the discount when no cap applies", () => {
    const result = priceRound(
      founders,
      { name: "Series A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s1", name: "SAFE (discount)", amount: 400_000, discount: 0.2 }],
    );
    // 20% off a $2.00 round price is $1.60.
    expect(result.safeConversions[0]!.effectivePrice).toBeCloseTo(1.6, 10);
    expect(result.safeConversions[0]!.shares).toBeCloseTo(250_000, 6);
  });

  it("takes whichever of cap and discount favours the SAFE holder", () => {
    // A generous cap beats a modest discount.
    const capWins = priceRound(
      founders,
      { name: "A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s", name: "SAFE", amount: 1_000_000, valuationCap: 6_000_000, discount: 0.1 }],
    );
    expect(capWins.safeConversions[0]!.effectivePrice).toBeCloseTo(0.6, 10);

    // A high cap makes the discount the better term.
    const discountWins = priceRound(
      founders,
      { name: "A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s", name: "SAFE", amount: 1_000_000, valuationCap: 100_000_000, discount: 0.25 }],
    );
    expect(discountWins.safeConversions[0]!.effectivePrice).toBeCloseTo(1.5, 10);
  });

  it("creates an option pool pre-money, so existing holders bear the dilution", () => {
    const withPool = priceRound(founders, {
      name: "Seed",
      amount: 2_000_000,
      preMoneyValuation: 8_000_000,
      optionPoolTarget: 0.1,
    });
    const pool = withPool.rows.find((r) => r.kind === "option-pool")!;
    expect(pool.ownership).toBeCloseTo(0.1, 6);
    // The investor still gets their full 20% — the pool did not come out of it.
    expect(withPool.rows.find((r) => r.name === "Seed")!.ownership).toBeCloseTo(0.2, 6);
    // Founders absorb it: 60% → 60% × 70% = 42%.
    expect(withPool.rows.find((r) => r.name === "Founder A")!.ownership).toBeCloseTo(0.42, 6);
    expect(totalOwnership(withPool.rows)).toBeCloseTo(1, 6);
  });

  it("refuses to price a round against an empty cap table", () => {
    expect(() => priceRound([], { name: "Seed", amount: 1, preMoneyValuation: 1 })).toThrow();
  });
});

describe("dilutionPath", () => {
  it("reports monotonically decreasing founder ownership across rounds", () => {
    const path = dilutionPath(founders, [
      { round: { name: "Seed", amount: 2_000_000, preMoneyValuation: 8_000_000 } },
      { round: { name: "Series A", amount: 8_000_000, preMoneyValuation: 32_000_000 } },
      { round: { name: "Series B", amount: 20_000_000, preMoneyValuation: 100_000_000 } },
    ]);
    expect(path).toHaveLength(3);
    expect(path[0]!.founderOwnership).toBeCloseTo(0.8, 6);
    expect(path[1]!.founderOwnership).toBeLessThan(path[0]!.founderOwnership);
    expect(path[2]!.founderOwnership).toBeLessThan(path[1]!.founderOwnership);
    // 80% × 80% × 83.3% ≈ 53.3%
    expect(path[2]!.founderOwnership).toBeCloseTo(0.8 * 0.8 * (100 / 120), 4);
  });
});
