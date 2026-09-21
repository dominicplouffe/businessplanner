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
  /** Carried through so a holder can be followed across rounds. `dilutionPath`
   *  used to match founder *ids* against row *names*, so unless the two
   *  happened to be equal every founder was re-keyed after the first round
   *  and the dilution column went blank from round two on. */
  id: string;
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

  /* SAFE conversion, solved rather than approximated.

     Two things were wrong here and both favoured the founders, in the one
     module whose header says a wrong answer is worse than none.

     `Safe.valuationCap` is documented as a *post-money* cap, and a post-money
     cap entitles the holder to `amount / cap` of the company as it stands
     once every SAFE has converted. It was divided by the *pre-money* share
     count, which is the pre-money convention and hands the holder less.

     And the priced investor was issued shares at `preMoney / workingShares`
     while the SAFE shares were added to the denominator afterwards — so the
     lead ended up below the percentage they had negotiated. SAFEs convert
     pre-money: the dilution belongs to the existing holders, and the new
     investor gets `amount / postMoney`.

     Both denominators are therefore "shares once the SAFEs have converted",
     which is what the SAFEs are being solved for. The loop is a fixed point:
     it contracts whenever the SAFEs claim less than the whole company, and
     the check afterwards refuses the case where they do not. */
  /* The share of the converted table each SAFE claims, which is what makes
     the fixed point below a contraction. A cap claims `amount / cap`; a
     discount claims `amount / (preMoney × (1 − d))`, because its price is
     struck off the round price. Whichever is cheaper for the holder governs,
     so the larger fraction is the one that counts. If the total reaches one,
     the SAFEs have sold the company twice and there is no table to solve. */
  const claimed = safes.reduce((sum, safe) => {
    const byCap = safe.valuationCap ? safe.amount / safe.valuationCap : 0;
    const byDiscount =
      safe.discount && round.preMoneyValuation > 0
        ? safe.amount / (round.preMoneyValuation * (1 - safe.discount))
        : 0;
    return sum + Math.max(byCap, byDiscount);
  }, 0);
  if (claimed >= 1) {
    throw new Error(
      "SAFEs cannot convert: their caps and discounts claim the whole company or more. Check them against the amounts raised.",
    );
  }

  let safeShares = 0;
  let safeConversions: RoundResult["safeConversions"] = [];
  for (let pass = 0; pass < 64; pass += 1) {
    const converted = workingShares + safeShares;
    const roundPrice = converted > 0 ? round.preMoneyValuation / converted : 0;

    let next = 0;
    safeConversions = safes.map((safe) => {
      const discounted = safe.discount ? roundPrice * (1 - safe.discount) : roundPrice;
      const capPrice = safe.valuationCap ? safe.valuationCap / converted : Infinity;
      const effectivePrice = Math.min(discounted, capPrice);
      const shares = effectivePrice > 0 ? safe.amount / effectivePrice : 0;
      next += shares;
      return { name: safe.name, shares, effectivePrice, ownership: 0 };
    });

    if (Math.abs(next - safeShares) <= Math.max(1e-9, Math.abs(next) * 1e-12)) {
      safeShares = next;
      break;
    }
    safeShares = next;
  }

  // Priced pre-money, over the table the SAFEs have already converted into.
  const pricePerShare =
    workingShares + safeShares > 0 ? round.preMoneyValuation / (workingShares + safeShares) : 0;
  const newShares = pricePerShare > 0 ? round.amount / pricePerShare : 0;
  const totalAfter = workingShares + safeShares + newShares;

  const rows: CapTableRow[] = existing.map((h) => ({
    id: h.id,
    name: h.name,
    kind: h.kind,
    shares: h.shares,
    ownership: ownershipOf(h.shares, totalAfter),
    priorOwnership: priorOwnership.get(h.id) ?? null,
  }));

  if (poolShares > 0) {
    rows.push({
      id: `${round.name}:pool`,
      name: "Option pool (new)",
      kind: "option-pool",
      shares: poolShares,
      ownership: ownershipOf(poolShares, totalAfter),
      priorOwnership: null,
    });
  }

  safes.forEach((safe, i) => {
    const conv = safeConversions[i]!;
    conv.ownership = ownershipOf(conv.shares, totalAfter);
    rows.push({
      id: safe.id,
      name: conv.name,
      kind: "investor",
      shares: conv.shares,
      ownership: conv.ownership,
      priorOwnership: null,
    });
  });

  rows.push({
    id: `${round.name}:lead`,
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

  for (const { round, safes } of rounds) {
    const result = priceRound(holders, round, safes ?? []);
    const founderShares = result.rows
      .filter((r) => r.kind === "founder")
      .reduce((s, r) => s + r.shares, 0);
    path.push({
      roundName: round.name,
      founderOwnership: ownershipOf(founderShares, result.totalSharesAfter),
    });
    /* Carry the post-round table forward, ids intact. This used to re-key
       every row as `${round.name}-${idx}` unless the holder's id happened to
       equal their name, so from the second round on nothing matched the
       previous table and `priorOwnership` — the dilution column — was null
       for every founder. */
    holders = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      shares: r.shares,
      kind: r.kind,
    }));
  }

  return path;
}
