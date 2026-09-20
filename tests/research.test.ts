import { describe, expect, it } from "vitest";
import { keepVerifiable, SourceSchema } from "@/lib/research/types";
import { OfflineResearcher } from "@/lib/research/offline-researcher";
import { assessResilience } from "@/lib/market/resilience";

describe("keepVerifiable", () => {
  const good = {
    label: "Pricing page",
    url: "https://example.com/pricing",
    publisher: "Example",
    sourceDate: "2026-09-01",
    claim: "The starter tier is $29 a month.",
  };

  it("keeps a source that can actually be re-checked", () => {
    expect(keepVerifiable([good])).toEqual([good]);
  });

  it("drops a source with no date, because nobody can re-check it", () => {
    expect(keepVerifiable([{ ...good, sourceDate: "" }])).toEqual([]);
    expect(keepVerifiable([{ ...good, sourceDate: "September 2026" }])).toEqual([]);
  });

  it("drops anything that is not a real link", () => {
    expect(keepVerifiable([{ ...good, url: "example.com/pricing" }])).toEqual([]);
    expect(keepVerifiable([{ ...good, url: "" }])).toEqual([]);
    expect(keepVerifiable([{ ...good, url: "javascript:alert(1)" }])).toEqual([]);
  });

  it("drops a source supporting no stated claim", () => {
    expect(keepVerifiable([{ ...good, claim: "" }])).toEqual([]);
  });

  it("filters rather than throws, so one bad source does not lose the good ones", () => {
    expect(keepVerifiable([{ nonsense: true }, good, null, "a string"])).toEqual([good]);
  });

  it("requires an ISO date on the schema itself", () => {
    expect(SourceSchema.safeParse({ ...good, sourceDate: "01/09/2026" }).success).toBe(false);
  });
});

describe("OfflineResearcher", () => {
  /**
   * This is the point of the class, so it is worth an assertion: the offline
   * path must never return data. A fabricated citation in a product whose
   * headline guarantee is zero uncited claims would be the worst defect in it.
   */
  it("returns nothing and says why, rather than composing a citation", async () => {
    const researcher = new OfflineResearcher();
    for (const result of [
      await researcher.findCompetitors(),
      await researcher.sizeMarket(),
    ]) {
      expect(result.status).toBe("unavailable");
      if (result.status !== "unavailable") continue;
      expect(result.reason).toMatch(/ANTHROPIC_API_KEY/);
      expect(result).not.toHaveProperty("data");
    }
  });
});

describe("assessResilience", () => {
  const task = (id: string, shareOfCost: number, level: "low" | "moderate" | "high") => ({
    id, task: `Task ${id}`, shareOfCost, level, rationale: "Because.",
  });

  it("weights exposure by cost share rather than counting tasks", () => {
    // Three small exposed tasks against one large safe one: counting says
    // mostly exposed, weighting says the opposite, and weighting is right.
    const counted = assessResilience({
      tasks: [
        task("a", 0.02, "high"), task("b", 0.02, "high"), task("c", 0.02, "high"),
        task("d", 0.74, "low"),
      ],
      moatKind: "physical-presence",
      moatStatement: "The work happens on site.",
      roadmap: [{ id: "r1", horizon: "now", action: "Automate booking", expectedEffect: "Fewer calls" }],
    });
    expect(counted.exposure).not.toBeNull();
    expect(counted.exposure!).toBeLessThan(0.3);
    expect(counted.band).toBe("low");
  });

  it("rates a business whose main cost is exposed as exposed", () => {
    const result = assessResilience({
      tasks: [task("a", 0.7, "high"), task("b", 0.1, "low")],
      moatKind: "proprietary-data",
      moatStatement: "We hold the only dataset.",
      roadmap: [{ id: "r1", horizon: "now", action: "Ship the tool", expectedEffect: "Cheaper delivery" }],
    });
    expect(result.band).toBe("high");
  });

  it("is unassessed rather than zero when nothing has been entered", () => {
    const result = assessResilience({});
    expect(result.exposure).toBeNull();
    expect(result.band).toBe("unassessed");
    expect(result.complete).toBe(false);
  });

  it("names what is missing, because a lender reads the gap as evasion", () => {
    const thin = assessResilience({ tasks: [task("a", 0.2, "high")] });
    expect(thin.gaps.join(" ")).toMatch(/cost base/);
    expect(thin.gaps.join(" ")).toMatch(/moat/);
    expect(thin.gaps.join(" ")).toMatch(/adoption steps/);
  });

  it("objects to a rating given with no reasoning behind it", () => {
    const result = assessResilience({
      tasks: [{ id: "a", task: "Bookkeeping", shareOfCost: 0.8, level: "high", rationale: "" }],
      moatKind: "local-network",
      moatStatement: "Twenty years of referrals.",
      roadmap: [{ id: "r1", horizon: "now", action: "Adopt tooling", expectedEffect: "Lower cost" }],
    });
    expect(result.gaps.join(" ")).toMatch(/no reasoning/);
    expect(result.complete).toBe(false);
  });

  it("is complete when all three parts are answered", () => {
    const result = assessResilience({
      tasks: [task("a", 0.5, "moderate"), task("b", 0.3, "low")],
      moatKind: "licence-or-regulation",
      moatStatement: "A state licence takes two years to obtain.",
      roadmap: [
        { id: "r1", horizon: "now", action: "Automate quoting", expectedEffect: "Two hours a day back" },
        { id: "r2", horizon: "year-1", action: "Retrain the team", expectedEffect: "Higher-value work" },
      ],
    });
    expect(result.gaps).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("ranks the tasks a lender will ask about first", () => {
    const result = assessResilience({
      tasks: [task("small", 0.05, "high"), task("big", 0.6, "high"), task("safe", 0.35, "low")],
      moatKind: "physical-presence",
      moatStatement: "On site.",
      roadmap: [{ id: "r1", horizon: "now", action: "x", expectedEffect: "y" }],
    });
    expect(result.mostExposed[0]!.id).toBe("big");
  });
});
