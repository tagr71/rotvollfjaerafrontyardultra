/**
 * Unit tests for `computeJerseyStatus` — the pure helper that turns
 * a per-loop standings snapshot into a DECIDED / LIKELY / FINISHED /
 * null indicator for one (jersey, sex) cell.
 *
 * Math recap (max = remaining × per-loop swing):
 *   pink   → DECIDED when leader.pts − runnerUp.pts > max (max = rem × 3)
 *   green  → DECIDED when leader.pts − runnerUp.pts > max (max = rem × 10)
 *   yellow → DECIDED when runnerUp.sec − leader.sec > max (max = rem × 600)
 *   any    → LIKELY  when lead > max × 0.5 (and not yet DECIDED)
 *   any    → FINISHED when snapshotLoop >= endsAt
 *
 * The `raceFinished` argument is intentionally inert: during playback
 * of earlier loops we still want DECIDED to show up even though the
 * global race is over.
 */

import { describe, expect, it } from "vitest";
import {
  computeJerseyStatus,
  type DisplayRow,
} from "../jerseyRanking";

const row = (rank: number, value: number): DisplayRow => ({
  rank,
  bib: String(100 + rank),
  name: `R${rank}`,
  club: "",
  value: String(value),
  rawValue: value,
});

describe("computeJerseyStatus — FINISHED", () => {
  it("returns 'finished' when snapshotLoop === endsAt", () => {
    expect(
      computeJerseyStatus([row(1, 50), row(2, 20)], "pink", 10, 10, false),
    ).toBe("finished");
  });

  it("returns 'finished' when snapshotLoop > endsAt", () => {
    expect(
      computeJerseyStatus([row(1, 50), row(2, 20)], "green", 10, 12, false),
    ).toBe("finished");
  });

  it("returns 'finished' even when raceFinished is false (snapshot-driven)", () => {
    expect(
      computeJerseyStatus([row(1, 50)], "yellow", 5, 5, false),
    ).toBe("finished");
  });
});

describe("computeJerseyStatus — null / no-data", () => {
  it("returns null when snapshotLoop is null", () => {
    expect(
      computeJerseyStatus([row(1, 50)], "pink", 10, null, false),
    ).toBeNull();
  });

  it("returns null when rows is empty", () => {
    expect(computeJerseyStatus([], "green", 10, 3, false)).toBeNull();
  });

  it("returns null when leader has no rawValue", () => {
    const r: DisplayRow = { rank: 1, bib: "1", name: "x", club: "", value: "0" };
    expect(computeJerseyStatus([r], "pink", 10, 3, false)).toBeNull();
  });
});

describe("computeJerseyStatus — raceFinished is NOT a short-circuit", () => {
  it("still returns 'decided' during playback of a mid-race loop even if race is over", () => {
    // Loop 3 of 10, pink jersey, 50 vs 10 → lead 40 > 7×3=21 → DECIDED.
    expect(
      computeJerseyStatus([row(1, 50), row(2, 10)], "pink", 10, 3, true),
    ).toBe("decided");
  });

  it("still returns null for an undecided snapshot even if race is over", () => {
    // Loop 3 of 10, pink jersey, 20 vs 18 → lead 2, max 21, half 10.5 → null.
    expect(
      computeJerseyStatus([row(1, 20), row(2, 18)], "pink", 10, 3, true),
    ).toBeNull();
  });
});

describe("computeJerseyStatus — pink (3 pts/loop)", () => {
  // endsAt=10, snapshot=4 → remaining=6, threshold=18.
  it("DECIDED when lead > remaining × 3", () => {
    expect(
      computeJerseyStatus([row(1, 30), row(2, 11)], "pink", 10, 4, false),
    ).toBe("decided"); // lead 19 > 18
  });

  it("LIKELY when lead === remaining × 3 (max boundary, still > half)", () => {
    expect(
      computeJerseyStatus([row(1, 30), row(2, 12)], "pink", 10, 4, false),
    ).toBe("likely"); // lead 18, not > 18, but > 9
  });

  it("LIKELY when lead < remaining × 3 but > half", () => {
    expect(
      computeJerseyStatus([row(1, 30), row(2, 13)], "pink", 10, 4, false),
    ).toBe("likely"); // lead 17 > 9
  });

  it("null when lead === half of remaining × 3 (strict inequality)", () => {
    expect(
      computeJerseyStatus([row(1, 30), row(2, 21)], "pink", 10, 4, false),
    ).toBeNull(); // lead 9, not > 9
  });

  it("null when lead < half of remaining × 3", () => {
    expect(
      computeJerseyStatus([row(1, 30), row(2, 22)], "pink", 10, 4, false),
    ).toBeNull(); // lead 8 < 9
  });

  it("DECIDED with a single-row leader treats runnerUp as 0 points", () => {
    // remaining=6, threshold=18. Solo leader with 19 pts → DECIDED.
    expect(
      computeJerseyStatus([row(1, 19)], "pink", 10, 4, false),
    ).toBe("decided");
  });

  it("LIKELY with a single-row leader whose total == threshold", () => {
    expect(
      computeJerseyStatus([row(1, 18)], "pink", 10, 4, false),
    ).toBe("likely");
  });

  it("null with a single-row leader whose total <= half", () => {
    expect(
      computeJerseyStatus([row(1, 9)], "pink", 10, 4, false),
    ).toBeNull();
  });
});

describe("computeJerseyStatus — green (10 pts/loop)", () => {
  // endsAt=15, snapshot=10 → remaining=5, threshold=50.
  it("DECIDED when lead > remaining × 10", () => {
    expect(
      computeJerseyStatus([row(1, 100), row(2, 49)], "green", 15, 10, false),
    ).toBe("decided"); // lead 51 > 50
  });

  it("LIKELY when lead === remaining × 10 (max boundary)", () => {
    expect(
      computeJerseyStatus([row(1, 100), row(2, 50)], "green", 15, 10, false),
    ).toBe("likely"); // lead 50, not > 50, but > 25
  });

  it("LIKELY when lead < remaining × 10 but > half", () => {
    expect(
      computeJerseyStatus([row(1, 100), row(2, 60)], "green", 15, 10, false),
    ).toBe("likely"); // lead 40 > 25
  });

  it("null when lead === half of remaining × 10", () => {
    expect(
      computeJerseyStatus([row(1, 100), row(2, 75)], "green", 15, 10, false),
    ).toBeNull(); // lead 25, not > 25
  });

  it("null when lead < half of remaining × 10", () => {
    expect(
      computeJerseyStatus([row(1, 100), row(2, 80)], "green", 15, 10, false),
    ).toBeNull(); // lead 20 < 25
  });
});

describe("computeJerseyStatus — yellow (10 min closure per loop)", () => {
  // endsAt=27, snapshot=20 → remaining=7, threshold=7 × 600 = 4200 sec (70 min).
  it("DECIDED when runnerUp − leader > remaining × 600", () => {
    expect(
      computeJerseyStatus(
        [row(1, 10_000), row(2, 14_201)],
        "yellow",
        27,
        20,
        false,
      ),
    ).toBe("decided"); // gap 4201 > 4200
  });

  it("LIKELY when gap === remaining × 600 (max boundary)", () => {
    expect(
      computeJerseyStatus(
        [row(1, 10_000), row(2, 14_200)],
        "yellow",
        27,
        20,
        false,
      ),
    ).toBe("likely"); // gap 4200, not > 4200, but > 2100
  });

  it("LIKELY when gap < remaining × 600 but > half", () => {
    expect(
      computeJerseyStatus(
        [row(1, 10_000), row(2, 14_199)],
        "yellow",
        27,
        20,
        false,
      ),
    ).toBe("likely"); // gap 4199 > 2100
  });

  it("null when gap === half of remaining × 600", () => {
    expect(
      computeJerseyStatus(
        [row(1, 10_000), row(2, 12_100)],
        "yellow",
        27,
        20,
        false,
      ),
    ).toBeNull(); // gap 2100, not > 2100
  });

  it("null when gap < half of remaining × 600", () => {
    expect(
      computeJerseyStatus(
        [row(1, 10_000), row(2, 12_099)],
        "yellow",
        27,
        20,
        false,
      ),
    ).toBeNull(); // gap 2099 < 2100
  });

  it("DECIDED with a single-row leader (no runner-up to catch them)", () => {
    expect(
      computeJerseyStatus([row(1, 10_000)], "yellow", 27, 20, false),
    ).toBe("decided");
  });

  it("guards against runner-up having no rawValue (returns null)", () => {
    const leader = row(1, 10_000);
    const ru: DisplayRow = { rank: 2, bib: "2", name: "x", club: "", value: "?" };
    expect(
      computeJerseyStatus([leader, ru], "yellow", 27, 20, false),
    ).toBeNull();
  });
});

describe("computeJerseyStatus — DECIDED right before the final loop", () => {
  // remaining=1 means the threshold equals one loop's max value.
  it("pink: lead must exceed 3 pts in the last loop", () => {
    expect(
      computeJerseyStatus([row(1, 10), row(2, 6)], "pink", 10, 9, false),
    ).toBe("decided"); // lead 4 > 3
    // remaining=1, max=3, half=1.5: lead 3 is not > 3 but is > 1.5 → LIKELY
    expect(
      computeJerseyStatus([row(1, 10), row(2, 7)], "pink", 10, 9, false),
    ).toBe("likely");
    expect(
      computeJerseyStatus([row(1, 10), row(2, 9)], "pink", 10, 9, false),
    ).toBeNull(); // lead 1, not > 1.5
  });

  it("green: lead must exceed 10 pts in the last loop", () => {
    expect(
      computeJerseyStatus([row(1, 100), row(2, 89)], "green", 10, 9, false),
    ).toBe("decided"); // lead 11 > 10
    // remaining=1, max=10, half=5: lead 10 not > 10 but > 5 → LIKELY
    expect(
      computeJerseyStatus([row(1, 100), row(2, 90)], "green", 10, 9, false),
    ).toBe("likely");
    expect(
      computeJerseyStatus([row(1, 100), row(2, 95)], "green", 10, 9, false),
    ).toBeNull(); // lead 5, not > 5
  });

  it("yellow: gap must exceed 600 sec (10 min) in the last loop", () => {
    expect(
      computeJerseyStatus(
        [row(1, 1000), row(2, 1601)],
        "yellow",
        10,
        9,
        false,
      ),
    ).toBe("decided"); // gap 601 > 600
    // remaining=1, max=600, half=300: gap 600 not > 600 but > 300 → LIKELY
    expect(
      computeJerseyStatus(
        [row(1, 1000), row(2, 1600)],
        "yellow",
        10,
        9,
        false,
      ),
    ).toBe("likely");
    expect(
      computeJerseyStatus(
        [row(1, 1000), row(2, 1300)],
        "yellow",
        10,
        9,
        false,
      ),
    ).toBeNull(); // gap 300, not > 300
  });
});
