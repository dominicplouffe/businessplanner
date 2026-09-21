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

  /* `Safe.valuationCap` is a POST-money cap, so the holder is entitled to
     `amount / cap` of the company once every SAFE has converted and before
     the new money lands. It used to be divided by the pre-money share count
     — the pre-money convention — which handed the holder fewer shares than
     the instrument promises.

     10,000,000 founder shares; $500k SAFE on a $5M post-money cap, so the
     SAFE takes 10% of the converted table:
       T = 10,000,000 / (1 − 0.10)  = 11,111,111.11 shares
       SAFE                          = 1,111,111.11 shares  (10% of T)
       cap price = 5,000,000 / T     = $0.45
       round price = 20,000,000 / T  = $1.80  */
  it("converts a post-money cap against the converted table, not the pre-money one", () => {
    const result = priceRound(
      founders,
      { name: "Series A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s1", name: "SAFE (capped)", amount: 500_000, valuationCap: 5_000_000 }],
    );
    expect(result.pricePerShare).toBeCloseTo(1.8, 10);
    const conv = result.safeConversions[0]!;
    expect(conv.effectivePrice).toBeCloseTo(0.45, 10);
    expect(conv.shares).toBeCloseTo(1_111_111.111111, 4);

    // What the cap actually promises: 10% of the company before the round.
    const converted = result.totalSharesAfter - result.newSharesIssued;
    expect(conv.shares / converted).toBeCloseTo(0.1, 10);
    expect(totalOwnership(result.rows)).toBeCloseTo(1, 10);
  });

  /* The round price is struck over the table the SAFEs have converted into,
     so the lead gets the percentage it negotiated and the SAFE dilutes the
     founders. Pricing the lead over the pre-SAFE count and then adding the
     SAFE shares to the denominator put the lead below its own term sheet. */
  it("gives the priced investor exactly the share it paid for", () => {
    const result = priceRound(
      founders,
      { name: "Series A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s1", name: "SAFE (capped)", amount: 500_000, valuationCap: 5_000_000 }],
    );
    const lead = result.rows.find((r) => r.name === "Series A")!;
    // $5M of a $25M post-money company.
    expect(lead.ownership).toBeCloseTo(0.2, 10);
  });

  /* $400k at 20% off, no cap:
       discounted = 0.8 × 20,000,000 / T,  SAFE shares = 400,000 / discounted
       ⇒ T = 10,000,000 / (1 − 1/40) = 10,256,410.26
       round price = $1.95, discounted = $1.56  */
  it("converts a SAFE at the discount when no cap applies", () => {
    const result = priceRound(
      founders,
      { name: "Series A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s1", name: "SAFE (discount)", amount: 400_000, discount: 0.2 }],
    );
    expect(result.pricePerShare).toBeCloseTo(1.95, 10);
    expect(result.safeConversions[0]!.effectivePrice).toBeCloseTo(1.56, 10);
    expect(result.safeConversions[0]!.shares).toBeCloseTo(256_410.2564, 4);
  });

  it("takes whichever of cap and discount favours the SAFE holder", () => {
    // A generous cap beats a modest discount. $1M on a $6M post-money cap is
    // 1/6 of the converted table, so T = 10M / (5/6) = 12,000,000 and the
    // cap prices at 6,000,000 / 12,000,000 = $0.50 against a $1.50 discount.
    const capWins = priceRound(
      founders,
      { name: "A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s", name: "SAFE", amount: 1_000_000, valuationCap: 6_000_000, discount: 0.1 }],
    );
    expect(capWins.safeConversions[0]!.effectivePrice).toBeCloseTo(0.5, 10);

    // A high cap makes the discount the better term. 25% off, so
    // T = 10M / (14/15) = 10,714,285.71, round price $1.8667, discounted $1.40.
    const discountWins = priceRound(
      founders,
      { name: "A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [{ id: "s", name: "SAFE", amount: 1_000_000, valuationCap: 100_000_000, discount: 0.25 }],
    );
    expect(discountWins.safeConversions[0]!.effectivePrice).toBeCloseTo(1.4, 10);
  });

  it("dilutes SAFEs against each other rather than letting them stack", () => {
    // Two $500k SAFEs on a $5M cap claim 10% each; both must fit inside the
    // same converted table, not each take 10% of a table that ignores the
    // other. T = 10,000,000 / (1 − 0.2) = 12,500,000.
    const result = priceRound(
      founders,
      { name: "Series A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
      [
        { id: "s1", name: "SAFE one", amount: 500_000, valuationCap: 5_000_000 },
        { id: "s2", name: "SAFE two", amount: 500_000, valuationCap: 5_000_000 },
      ],
    );
    const converted = result.totalSharesAfter - result.newSharesIssued;
    expect(converted).toBeCloseTo(12_500_000, 4);
    for (const conv of result.safeConversions) {
      expect(conv.shares / converted).toBeCloseTo(0.1, 10);
    }
    expect(totalOwnership(result.rows)).toBeCloseTo(1, 10);
  });

  it("refuses a set of caps that claims the whole company", () => {
    expect(() =>
      priceRound(
        founders,
        { name: "Series A", amount: 5_000_000, preMoneyValuation: 20_000_000 },
        [{ id: "s", name: "Impossible", amount: 5_000_000, valuationCap: 4_000_000 }],
      ),
    ).toThrow(/whole company/i);
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

  /* `dilutionPath` re-keyed every row as `${round.name}-${idx}` unless a
     holder's id happened to equal their name, so from the second round on
     nothing matched the previous table and `priorOwnership` — the dilution
     column itself — was null for every founder. The test above never saw it,
     because founder ownership is summed by `kind`. */
  it("keeps holders identifiable across rounds, so dilution can be shown", () => {
    const seed = priceRound(founders, {
      name: "Seed",
      amount: 2_000_000,
      preMoneyValuation: 8_000_000,
    });
    expect(seed.rows.find((r) => r.name === "Founder A")!.id).toBe("a");

    // Carry the table forward exactly as dilutionPath does, then price again.
    const carried: Holder[] = seed.rows.map((r) => ({
      id: r.id,
      name: r.name,
      shares: r.shares,
      kind: r.kind,
    }));
    const seriesA = priceRound(carried, {
      name: "Series A",
      amount: 8_000_000,
      preMoneyValuation: 32_000_000,
    });

    const a = seriesA.rows.find((r) => r.name === "Founder A")!;
    expect(a.priorOwnership).not.toBeNull();
    expect(a.priorOwnership).toBeCloseTo(0.48, 10); // 60% × 80% after the seed
    expect(a.ownership).toBeCloseTo(0.48 * 0.8, 10);

    // And every holder carried forward keeps a dilution figure, not just the
    // founders — a blank column is the symptom this is guarding against.
    for (const row of seriesA.rows.filter((r) => carried.some((c) => c.id === r.id))) {
      expect(row.priorOwnership, row.name).not.toBeNull();
    }
  });
});
