/* ==========================================================================
   Cap table, SAFE conversion and dilution.
   --------------------------------------------------------------------------
   Kept deliberately explicit rather than clever: founders use this to answer
   "what do I own after the raise", and a wrong answer there is worse than no
   answer. Every intermediate is named so the arithmetic can be read.
   ========================================================================== */

export type Holder = { id: string; name: string; shares: number; kind: "founder" | "employee" | "investor" | "option-pool" };

export type Safe = {
  id: string;
  name: string;
  amount: number;
  /** Post-money valuation cap. */
  valuationCap?: number;
  /** Discount to the round price, e.g. 0.2 for 20% off. */
  discount?: number;
};

export type PricedRound = {
  name: string;
  /** New money invested. */
  amount: number;
  preMoneyValuation: number;
  /** Option pool as a share of post-money, topped up before the round prices. */
  optionPoolTarget?: number;
};

export type CapTableRow = {
  name: string;
  kind: Holder["kind"];
  shares: number;
  ownership: number;
  /** Ownership before this round, for the dilution column. */
  priorOwnership: number | null;
};

export type RoundResult = {
  roundName: string;
  preMoneyValuation: number;
  postMoneyValuation: number;
  pricePerShare: number;
  newSharesIssued: number;
  totalSharesAfter: number;
  rows: CapTableRow[];
  /** SAFE conversions, if any converted in this round. */
  safeConversions: { name: string; shares: number; effectivePrice: number; ownership: number }[];
};

function ownershipOf(shares: number, total: number): number {
  return total > 0 ? shares / total : 0;
}

/**
 * Prices a round, converting any outstanding SAFEs first.
 *
 * A SAFE converts at the better of its valuation cap and the round price less
 * its discount — which is the whole point of holding one. The option pool, when
 * a target is given, is topped up pre-money, so the dilution lands on existing
 * holders rather than on the new investor. That is the market convention and
 * the thing founders most often model wrongly in their own favour.
 */
export function priceRound(
  existing: Holder[],
  round: PricedRound,
  safes: Safe[] = [],
): RoundResult {
  const sharesBefore = existing.reduce((s, h) => s + h.shares, 0);
  if (sharesBefore <= 0) throw new Error("Cap table must have shares outstanding before a priced round");

  const priorTotal = sharesBefore;
  const priorOwnership = new Map(existing.map((h) => [h.id, ownershipOf(h.shares, priorTotal)]));

  // Headline price, before SAFE conversion and any pool top-up.
  let workingShares = sharesBefore;

  // Option pool top-up, pre-money.
  let poolShares = 0;
  if (round.optionPoolTarget && round.optionPoolTarget > 0) {
    const existingPool = existing
      .filter((h) => h.kind === "option-pool")
      .reduce((s, h) => s + h.shares, 0);
    // Solve for a pool that is `target` of the post-money share count.
    const postMoneyValuation = round.preMoneyValuation + round.amount;
    const investorFraction = round.amount / postMoneyValuation;
    const targetPoolFraction = round.optionPoolTarget;
    const remainingFraction = 1 - investorFraction - targetPoolFraction;
    if (remainingFraction > 0) {
      const impliedTotal = sharesBefore - existingPool > 0 ? (sharesBefore - existingPool) / remainingFraction : 0;
      poolShares = Math.max(0, impliedTotal * targetPoolFraction - existingPool);
    }
    workingShares += poolShares;
  }

  const pricePerShare = round.preMoneyValuation / workingShares;

  // SAFE conversion.
  const safeConversions: RoundResult["safeConversions"] = [];
  let safeShares = 0;
  for (const safe of safes) {
    const discounted = safe.discount ? pricePerShare * (1 - safe.discount) : pricePerShare;
    const capPrice = safe.valuationCap ? safe.valuationCap / workingShares : Infinity;
    const effectivePrice = Math.min(discounted, capPrice);
    const shares = effectivePrice > 0 ? safe.amount / effectivePrice : 0;
    safeShares += shares;
    safeConversions.push({ name: safe.name, shares, effectivePrice, ownership: 0 });
  }

  const newShares = pricePerShare > 0 ? round.amount / pricePerShare : 0;
  const totalAfter = workingShares + safeShares + newShares;

  const rows: CapTableRow[] = existing.map((h) => ({
    name: h.name,
    kind: h.kind,
    shares: h.shares,
    ownership: ownershipOf(h.shares, totalAfter),
    priorOwnership: priorOwnership.get(h.id) ?? null,
  }));

  if (poolShares > 0) {
    rows.push({
      name: "Option pool (new)",
      kind: "option-pool",
      shares: poolShares,
      ownership: ownershipOf(poolShares, totalAfter),
      priorOwnership: null,
    });
  }

  for (const conv of safeConversions) {
    conv.ownership = ownershipOf(conv.shares, totalAfter);
    rows.push({
      name: conv.name,
      kind: "investor",
      shares: conv.shares,
      ownership: conv.ownership,
      priorOwnership: null,
    });
  }

  rows.push({
    name: round.name,
    kind: "investor",
    shares: newShares,
    ownership: ownershipOf(newShares, totalAfter),
    priorOwnership: null,
  });

  return {
    roundName: round.name,
    preMoneyValuation: round.preMoneyValuation,
    postMoneyValuation: round.preMoneyValuation + round.amount,
    pricePerShare,
    newSharesIssued: newShares,
    totalSharesAfter: totalAfter,
    rows,
    safeConversions,
  };
}

/** Founder ownership after a sequence of rounds — the number they actually want. */
export function dilutionPath(
  founders: Holder[],
  rounds: { round: PricedRound; safes?: Safe[] }[],
): { roundName: string; founderOwnership: number }[] {
  let holders = [...founders];
  const path: { roundName: string; founderOwnership: number }[] = [];
  const founderIds = new Set(founders.map((f) => f.id));

  for (const { round, safes } of rounds) {
    const result = priceRound(holders, round, safes ?? []);
    const founderShares = result.rows
      .filter((r) => r.kind === "founder")
      .reduce((s, r) => s + r.shares, 0);
    path.push({
      roundName: round.name,
      founderOwnership: ownershipOf(founderShares, result.totalSharesAfter),
    });
    // Carry the post-round table forward.
    holders = result.rows.map((r, idx) => ({
      id: founderIds.has(r.name) ? r.name : `${round.name}-${idx}`,
      name: r.name,
      shares: r.shares,
      kind: r.kind,
    }));
  }

  return path;
}
