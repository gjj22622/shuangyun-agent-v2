import { describe, expect, it } from "vitest";
import { evaluateCommitteeReview } from "./index.js";

describe("evaluateCommitteeReview", () => {
  it("returns pass when the committee average is high and boss does not veto", () => {
    const review = evaluateCommitteeReview({
      boss: { score: 8, note: "ok" },
      manager: { score: 8, note: "ok" },
      window: { score: 7, note: "ok" },
      brand: { score: 8, note: "ok" }
    });

    expect(review.verdict).toBe("pass");
  });

  it("returns major_rework when boss vetoes but the other three scores stay high", () => {
    const review = evaluateCommitteeReview({
      boss: { score: 2, note: "ok" },
      manager: { score: 9, note: "ok" },
      window: { score: 9, note: "ok" },
      brand: { score: 9, note: "ok" }
    });

    expect(review.verdict).toBe("major_rework");
    expect(review.reasoningTrace).toContain("boss_veto=true");
  });

  it("returns reject when boss vetoes and the rest of the committee is also low", () => {
    const review = evaluateCommitteeReview({
      boss: { score: 2, note: "ok" },
      manager: { score: 3, note: "ok" },
      window: { score: 3, note: "ok" },
      brand: { score: 3, note: "ok" }
    });

    expect(review.verdict).toBe("reject");
  });

  it("returns minor_tweak for a middle-range overall average without boss veto", () => {
    const review = evaluateCommitteeReview({
      boss: { score: 7, note: "ok" },
      manager: { score: 7, note: "ok" },
      window: { score: 5, note: "ok" },
      brand: { score: 5, note: "ok" }
    });

    expect(review.verdict).toBe("minor_tweak");
  });

  it("returns major_rework when the overall average is between 4 and 6", () => {
    const review = evaluateCommitteeReview({
      boss: { score: 5, note: "ok" },
      manager: { score: 5, note: "ok" },
      window: { score: 5, note: "ok" },
      brand: { score: 5, note: "ok" }
    });

    expect(review.verdict).toBe("major_rework");
  });

  it("lowers confidence when score variance increases", () => {
    const stableReview = evaluateCommitteeReview({
      boss: { score: 7, note: "ok" },
      manager: { score: 7, note: "ok" },
      window: { score: 7, note: "ok" },
      brand: { score: 7, note: "ok" }
    });
    const volatileReview = evaluateCommitteeReview({
      boss: { score: 9, note: "ok" },
      manager: { score: 9, note: "ok" },
      window: { score: 4, note: "ok" },
      brand: { score: 4, note: "ok" }
    });

    expect(volatileReview.confidence).toBeLessThan(stableReview.confidence);
  });
});
