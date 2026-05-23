import { useEffect, useMemo, useRef, useState } from "react";
import {
  BACKYARD_LOOP_KM,
  FRONTYARD_LOOP_KM,
  FRONTYARD_START_MIN,
  LOOP_SECONDS,
  NowOsloRow,
  StatCard,
  formatDuration,
  formatHms,
  formatKm,
  formatOslo,
  frontyardElapsedAtLoopStart,
  frontyardState,
  osloWallClockToInstant,
  pad,
  panel,
  playBeep,
  playBell,
  playbackBtn,
  useNowTick,
  useTimerSettings,
  useViewLoop,
} from "./timerCore";

export function Dashboard({ eventId, eventName, eventLocation }: { eventId: string; eventName?: string; eventLocation?: string }) {
  const now = useNowTick();
  const { startTime, mode, fyLock, fyMax, beepEnabled, location,
    jerseyPink, jerseyGreen, jerseyYellow } = useTimerSettings(eventId);

  /** Background for the Remaining min:sec of loop card based on seconds left. */
  function remainingBg(secondsLeft: number): string {
    if (secondsLeft < 180) return "#fecaca"; // red
    if (secondsLeft < 360) return "#fef08a"; // yellow
    return "#ffffff"; // white
  }

  /** Required average pace given a loop time limit (min) and distance (km).
   * Returns `{ pace: "MM:SS", kmh: "N.N" }` (per km per hour). */
  function requiredPace(loopMin: number, distKm: number) {
    if (!isFinite(loopMin) || !isFinite(distKm) || loopMin <= 0 || distKm <= 0) {
      return { pace: "—", kmh: "—" };
    }
    const secPerKm = Math.round((loopMin * 60) / distKm);
    const m = Math.floor(secPerKm / 60);
    const s = secPerKm % 60;
    const kmh = (distKm / loopMin) * 60;
    return { pace: `${pad(m)}:${pad(s)}`, kmh: kmh.toFixed(1) };
  }

  const startInstant = osloWallClockToInstant(startTime);
  const liveDiffMs = startInstant ? now.getTime() - startInstant.getTime() : 0;
  const liveElapsedSec = Math.max(0, Math.floor(liveDiffMs / 1000));

  // Fetch leaderboard once + every 30 s. Used both for the runners-counters
  // and for the "race finished" detection that drives playback mode.
  const [raceFinished, setRaceFinished] = useState(false);
  const [finalLaps, setFinalLaps] = useState<number[]>([]);
  const [finalStatuses, setFinalStatuses] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;
    async function load() {
      try {
        const res = await fetch(`/api/results?event_id=${encodeURIComponent(eventId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          raceFinished?: boolean;
          rows?: { lapsCompleted: number | null; status?: string }[];
        };
        if (cancelled) return;
        const rows = data.rows ?? [];
        setRaceFinished(Boolean(data.raceFinished));
        setFinalLaps(
          rows.map((r) => (typeof r.lapsCompleted === "number" ? r.lapsCompleted : 0)),
        );
        setFinalStatuses(rows.map((r) => r.status ?? ""));
        // No point polling a finished race — the data is static.
        if (data.raceFinished && t !== null) {
          window.clearInterval(t);
          t = null;
        }
      } catch {
        // Leave previous values in place on transient errors.
      }
    }
    load();
    t = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      if (t !== null) window.clearInterval(t);
    };
  }, [eventId]);

  // Fetch jersey standings once + every 30 s, used to display the current
  // pink/green/yellow holders (Women + Men) after the last completed loop.
  // Only frontyard events publish jersey lists, so backyard returns empty.
  type HolderEntry = {
    bib: string;
    name: string;
    sex: string;
    points?: number;
    total?: string;
    totalSec?: number;
    lapsCompleted?: number;
    perLoop?: {
      loop: number;
      points?: number;
      time?: string;
      lapSec?: number;
      totalSec?: number;
    }[];
  };
  type JerseysFetchPayload = {
    green: HolderEntry[];
    pink: HolderEntry[];
    yellow: HolderEntry[];
  };
  const [jerseyData, setJerseyData] = useState<JerseysFetchPayload | null>(null);
  useEffect(() => {
    if (mode !== "frontyard") {
      setJerseyData(null);
      return;
    }
    let cancelled = false;
    let t: number | null = null;
    async function load() {
      try {
        const res = await fetch(`/api/jerseys?event_id=${encodeURIComponent(eventId)}`);
        if (!res.ok) return;
        const d = (await res.json()) as JerseysFetchPayload;
        if (cancelled) return;
        setJerseyData(d);
      } catch {
        // Leave previous values in place on transient errors.
      }
    }
    load();
    t = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      if (t !== null) window.clearInterval(t);
    };
  }, [eventId, mode]);

  // Playback: when the race is finished, the user can step loop-by-loop.
  // `viewLoop` is null while live; a number 1..maxLoop while scrubbing.
  const { viewLoop, setViewLoop } = useViewLoop(eventId);
  const maxLoop = finalLaps.length ? Math.max(1, ...finalLaps) : 0;

  // "Live" vs "Archived" gating: the replay scrubber is only available
  // once the race is actually over. For frontyard we use the local race
  // clock (the backend's `raceFinished` heuristic flips true spuriously
  // a few seconds into the race when only a placeholder leader is in
  // the field). Backyard has no fixed end, so we fall back to the
  // backend flag there.
  const raceClockFinished =
    mode === "frontyard"
      ? startInstant !== null && frontyardState(liveElapsedSec, fyLock, fyMax).finished
      : raceFinished;
  const replayAvailable = raceClockFinished && maxLoop >= 1;
  const inReplay =
    replayAvailable && viewLoop !== null && viewLoop >= 1;
  const effectiveViewLoop = inReplay
    ? Math.min(Math.max(1, viewLoop as number), Math.max(1, maxLoop))
    : null;

  // Compute the elapsed seconds we render with. In replay we pin elapsed to
  // 1 s into the start of `effectiveViewLoop` so the existing per-mode
  // formulas (loopsCompleted / frontyardState) yield the correct loop state.
  let elapsedSeconds = liveElapsedSec;
  let diffMs = liveDiffMs;
  if (effectiveViewLoop !== null) {
    const replayElapsed =
      mode === "backyard"
        ? (effectiveViewLoop - 1) * LOOP_SECONDS + 1
        : frontyardElapsedAtLoopStart(effectiveViewLoop, fyLock) + 1;
    elapsedSeconds = replayElapsed;
    diffMs = replayElapsed * 1000;
  }
  const beforeStart = effectiveViewLoop === null && liveDiffMs < 0;
  const label = effectiveViewLoop !== null
    ? `Replay · viewing loop ${effectiveViewLoop} of ${maxLoop}`
    : beforeStart
      ? "Remaining time until race starts"
      : "Time after race was started";

  // Backyard
  const loopsCompleted = Math.floor(elapsedSeconds / LOOP_SECONDS);
  const remainingInLoop = LOOP_SECONDS - (elapsedSeconds % LOOP_SECONDS);
  const remMin = Math.floor(remainingInLoop / 60);
  const remSec = remainingInLoop % 60;

  // Frontyard
  const fy = frontyardState(elapsedSeconds, fyLock, fyMax);
  const fyMin = Math.floor(fy.remainingSec / 60);
  const fySec = fy.remainingSec % 60;

  const backyardCompleted = beforeStart ? 0 : loopsCompleted;
  const backyardDistance = backyardCompleted * BACKYARD_LOOP_KM;
  const frontyardCompleted = beforeStart ? 0 : fy.loopsCompleted;
  const frontyardDistance = frontyardCompleted * FRONTYARD_LOOP_KM;

  /** Snapshot loop for the Dashboard's jersey holder cards. In live mode
   * this follows the race clock (so the cards advance as soon as the
   * timer ticks over to a new loop); in replay it follows the scrubber.
   * `frontyardCompleted` already reflects both cases. */
  const holderSnapshotLoop = mode === "frontyard" ? frontyardCompleted : 0;

  /** Top 3 holders per sex for each jersey, capped at the configured
   * jersey end-loop and the snapshot loop (live timer or replay). */
  const jerseyHolders = useMemo(() => {
    type Holder = { bib: string; name: string; value: string };
    const result = {
      pink: { K: [] as Holder[], M: [] as Holder[] },
      green: { K: [] as Holder[], M: [] as Holder[] },
      yellow: { K: [] as Holder[], M: [] as Holder[] },
    };
    if (!jerseyData || holderSnapshotLoop < 1) return result;
    // Combine sex info from green/yellow so we can classify pink entries.
    const sexLookup = new Map<string, string>();
    for (const e of jerseyData.green) {
      if (e.sex === "M" || e.sex === "K") sexLookup.set(e.bib, e.sex);
    }
    for (const e of jerseyData.yellow) {
      if (e.sex === "M" || e.sex === "K") sexLookup.set(e.bib, e.sex);
    }
    const resolveSex = (e: HolderEntry) =>
      e.sex === "M" || e.sex === "K" ? e.sex : sexLookup.get(e.bib) ?? "";
    const sumUpto = (e: HolderEntry, cap: number) =>
      (e.perLoop ?? [])
        .filter((p) => p.loop <= cap)
        .reduce((acc, p) => acc + (p.points ?? 0), 0);
    // Points scored on exactly `loop` (tie-break for green/pink).
    const pointsAtLoop = (e: HolderEntry, loop: number): number =>
      (e.perLoop ?? []).find((p) => p.loop === loop)?.points ?? 0;
    // Lap time on exactly `loop` (tie-break for yellow).
    const lapSecAtLoop = (e: HolderEntry, loop: number): number =>
      (e.perLoop ?? []).find((p) => p.loop === loop)?.lapSec ?? 0;
    // Cumulative race time from loop 1 through `cap`. Prefers the per-loop
    // cumulative `totalSec`; falls back to summing `lapSec`; finally to the
    // entry-level `totalSec` when no per-loop data is available.
    const accTimeUpto = (e: HolderEntry, cap: number): number => {
      const capped = (e.perLoop ?? []).filter((p) => p.loop <= cap);
      if (capped.length > 0) {
        const last = capped[capped.length - 1];
        if (typeof last.totalSec === "number" && last.totalSec > 0) {
          return last.totalSec;
        }
        const sum = capped.reduce(
          (acc, p) => acc + (typeof p.lapSec === "number" ? p.lapSec : 0),
          0,
        );
        if (sum > 0) return sum;
      }
      return e.totalSec ?? 0;
    };
    const pinkCap = Math.min(jerseyPink, holderSnapshotLoop);
    const greenCap = Math.min(jerseyGreen, holderSnapshotLoop);
    // Yellow freezes at jerseyYellow once the snapshot passes that loop,
    // so the holder stops changing for the remainder of the race.
    const yellowCap = Math.min(jerseyYellow, holderSnapshotLoop);
    for (const sex of ["K", "M"] as const) {
      result.pink[sex] = jerseyData.pink
        .filter((e) => resolveSex(e) === sex)
        .map((e) => ({ e, pts: sumUpto(e, pinkCap) }))
        .filter((x) => x.pts > 0)
        .sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          // Tie: most points on the snapshot loop (API points).
          return pointsAtLoop(b.e, pinkCap) - pointsAtLoop(a.e, pinkCap);
        })
        .slice(0, 3)
        .map((x) => ({ bib: x.e.bib, name: x.e.name, value: `${x.pts} p` }));
      result.green[sex] = jerseyData.green
        .filter((e) => resolveSex(e) === sex)
        .map((e) => ({ e, pts: sumUpto(e, greenCap) }))
        .filter((x) => x.pts > 0)
        .sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          // Tie: most points on the snapshot loop (API points).
          return pointsAtLoop(b.e, greenCap) - pointsAtLoop(a.e, greenCap);
        })
        .slice(0, 3)
        .map((x) => ({ bib: x.e.bib, name: x.e.name, value: `${x.pts} p` }));
      result.yellow[sex] = jerseyData.yellow
        .filter((e) => {
          if (resolveSex(e) !== sex) return false;
          const lc = typeof e.lapsCompleted === "number" ? e.lapsCompleted : 0;
          if (lc < yellowCap) return false;
          return accTimeUpto(e, yellowCap) > 0;
        })
        .sort((a, b) => {
          const ta = accTimeUpto(a, yellowCap);
          const tb = accTimeUpto(b, yellowCap);
          if (ta !== tb) return ta - tb;
          // Tie: faster lap on the snapshot loop wins.
          return lapSecAtLoop(a, yellowCap) - lapSecAtLoop(b, yellowCap);
        })
        .slice(0, 3)
        .map((e) => ({
          bib: e.bib,
          name: e.name,
          value: formatHms(accTimeUpto(e, yellowCap)),
        }));
    }
    return result;
  }, [jerseyData, holderSnapshotLoop, jerseyPink, jerseyGreen, jerseyYellow]);

  // Derive the runners-this-loop / completed-past-loop counters. The
  // detailed semantics are documented inline below; in short:
  //   startingThisLoop   = runners actively in loop N (subset of below)
  //   completedPastLoop  = runners who finished loop N-1 (cumulative;
  //                        ≥ startingThisLoop; equals 0 when N == 1).
  const isOut = (s?: string) => /dnf|dns|dq|withdrawn/i.test(s ?? "");
  let runnersStartingThisLoop: number | null = null;
  let runnersCompletedPastLoop: number | null = null;
  if (finalLaps.length > 0) {
    // In live mode the "current loop number being run" is derived from the
    // elapsed-time formulas, NOT from the leaderboard's max lap count: as
    // soon as one runner finishes the loop early their `lapsCompleted`
    // ticks up, but the loop itself is still in progress for everyone
    // else. Using leaderboard max would make this counter collapse to 1
    // (only the early finisher) the instant the first finish posts.
    const liveCurrentLoop =
      mode === "frontyard" ? fy.loopsCompleted + 1 : loopsCompleted + 1;
    const referenceN =
      effectiveViewLoop !== null ? effectiveViewLoop : liveCurrentLoop;
    const threshold = referenceN - 1; // laps that must be completed
    // "Runners starting this loop" (loop N) ⊆ "Runners completed past
    // loop" (loop N-1). The difference is the runners who finished N-1
    // but stopped (didn't go out for N). Both counters use the same
    // `threshold`-laps-completed predicate; the "starting" counter
    // additionally requires the runner to be active (still going).
    //
    //   * LIVE: "active" = current leaderboard status is not DNF/DQ/withdrawn.
    //   * REPLAY: "active at loop N" ≡ final lap count reached N
    //     (i.e. they later completed loop N). Final DNF/DQ labels can't
    //     tell us when a runner stopped, so we use lap count instead.
    runnersStartingThisLoop = inReplay
      ? finalLaps.filter((n) => n >= referenceN).length
      : finalLaps.filter(
          (n, i) => n >= threshold && !isOut(finalStatuses[i]),
        ).length;
    runnersCompletedPastLoop =
      referenceN < 2 ? 0 : finalLaps.filter((n) => n >= threshold).length;
  }
  const startingThisLoopValue = runnersStartingThisLoop === null ? "—" : String(runnersStartingThisLoop);
  const completedPastLoopValue = runnersCompletedPastLoop === null ? "—" : String(runnersCompletedPastLoop);

  /** Length (min) of the loop after `currentLoopNumber` in frontyard, or null if none. */
  function nextFrontyardLoopMin(currentLoopNumber: number): number | null {
    const nextK = currentLoopNumber + 1;
    if (nextK > fyMax) return null;
    const lockedLen = Math.max(1, FRONTYARD_START_MIN + 1 - fyLock);
    const naturalLen = Math.max(1, FRONTYARD_START_MIN + 1 - nextK);
    return nextK <= fyLock ? naturalLen : lockedLen;
  }

  /** Image sources awarded for completing `loopNumber` (frontyard). */
  function jerseyImagesFor(loopNumber: number): string[] {
    const imgs: string[] = [];
    if (loopNumber === jerseyPink) imgs.push("/rosa.png");
    if (loopNumber === jerseyGreen) imgs.push("/gr\u00f8nn.png");
    if (loopNumber === jerseyYellow) {
      imgs.push("/gul.png");
      imgs.push("/vinner.png");
    }
    return imgs;
  }

  function JerseyCard({ loopNumber }: { loopNumber: number | null }) {
    const imgs = loopNumber === null ? [] : jerseyImagesFor(loopNumber);
    return (
      <div style={panel}>
        <p style={{ margin: 0, color: "#555", fontWeight: 600 }}>
          Competition this loop
        </p>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "5rem",
          }}
        >
          {imgs.length === 0 ? (
            <span style={{ color: "#bbb", fontSize: "2rem" }}>—</span>
          ) : (
            imgs.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                style={{ height: "5rem", width: "auto", objectFit: "contain" }}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  /** One card per jersey color showing the current Women + Men holders
   * (name + total points / total time) after the last completed loop.
   * Used in frontyard mode so spectators can see who is winning each
   * competition without leaving the Dashboard. */
  function JerseyHoldersRow() {
    const cards: {
      key: "pink" | "green" | "yellow";
      label: string;
      bg: string;
      valueHeader: string;
      endsAt: number;
      img: string;
    }[] = [
      { key: "pink", label: "Pink jersey", bg: "#fce7f3", valueHeader: "Total points", endsAt: jerseyPink, img: "/rosa.png" },
      { key: "green", label: "Green jersey", bg: "#dcfce7", valueHeader: "Total points", endsAt: jerseyGreen, img: "/gr\u00f8nn.png" },
      { key: "yellow", label: "Yellow jersey", bg: "#fef9c3", valueHeader: "Overall time", endsAt: jerseyYellow, img: "/gul.png" },
    ];
    return (
      <>
        {cards.map((c) => {
          const h = jerseyHolders[c.key];
          const frozen =
            c.endsAt > 0 && holderSnapshotLoop > c.endsAt;
          const subtitle =
            holderSnapshotLoop < 1
              ? `no loops completed yet (of ${c.endsAt})`
              : frozen
                ? `frozen at loop ${c.endsAt}`
                : `after ${Math.min(holderSnapshotLoop, c.endsAt)} of ${c.endsAt} loops`;
          return (
            <div
              key={c.key}
              style={{ ...panel, background: c.bg, alignItems: "stretch" }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#333",
                  fontWeight: 600,
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <img
                  src={c.img}
                  alt=""
                  style={{ height: "2rem", width: "auto", objectFit: "contain" }}
                />
                <span>
                  {c.label}{" "}
                  <span style={{ color: "#666", fontWeight: 400, fontSize: "0.9em" }}>
                    ({subtitle})
                  </span>
                </span>
              </p>
              {(["K", "M"] as const).map((sex) => {
                const list = h[sex];
                const sexLabel = sex === "K" ? "Female" : "Male";
                return (
                  <div
                    key={sex}
                    style={{
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      paddingTop: "0.25rem",
                      marginTop: "0.25rem",
                    }}
                  >
                    <div
                      style={{
                        color: "#555",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        marginBottom: "0.15rem",
                      }}
                    >
                      {sexLabel}
                    </div>
                    {[0, 1, 2].map((i) => {
                      const holder = list[i];
                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: "0.5rem",
                            padding: "0.1rem 0",
                          }}
                        >
                          <span
                            style={{
                              color: "#777",
                              fontWeight: 600,
                              fontSize: "0.85rem",
                              minWidth: "1rem",
                            }}
                          >
                            {i + 1}.
                          </span>
                          <span
                            style={{
                              color: "#555",
                              fontWeight: 600,
                              fontSize: "0.85rem",
                              fontVariantNumeric: "tabular-nums",
                              minWidth: "2.2rem",
                              textAlign: "right",
                            }}
                            title="Bib"
                          >
                            {holder?.bib ?? "—"}
                          </span>
                          <span
                            style={{
                              flex: "1 1 auto",
                              textAlign: "left",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontSize: "0.9rem",
                            }}
                          >
                            {holder?.name ?? "—"}
                          </span>
                          <span
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 600,
                              fontSize: "0.9rem",
                            }}
                          >
                            {holder?.value ?? "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <p
                style={{
                  margin: 0,
                  color: "#777",
                  fontSize: "0.75rem",
                  textAlign: "right",
                }}
              >
                {c.valueHeader}
              </p>
            </div>
          );
        })}
      </>
    );
  }

  // Beep at 3 (×3), 2 (×2) and 1 (×1) minute remaining of the current loop,
  // and ring a bell at each loop rollover and on race finish (frontyard).
  // Suppressed during replay (`inReplay`) so scrubbing doesn't trigger beeps.
  const activeRemainingSec: number | null =
    !startInstant || beforeStart || inReplay
      ? null
      : mode === "backyard"
        ? remainingInLoop
        : fy.finished
          ? null
          : fy.remainingSec;
  const prevRemainingRef = useRef<number | null>(null);
  const prevFinishedRef = useRef<boolean>(false);
  useEffect(() => {
    const prev = prevRemainingRef.current;
    prevRemainingRef.current = activeRemainingSec;
    if (!beepEnabled) return;
    // Loop boundary: remaining counted down toward 0 and then jumped up
    // (rollover to the next loop), or the race just finished.
    const justFinished = mode === "frontyard" && fy.finished && !prevFinishedRef.current;
    prevFinishedRef.current = mode === "frontyard" ? fy.finished : false;
    if (
      prev !== null &&
      activeRemainingSec !== null &&
      prev > 0 &&
      prev <= 5 &&
      activeRemainingSec > prev
    ) {
      playBell(2000);
      return;
    }
    if (justFinished) {
      playBell(2000);
      return;
    }
    if (activeRemainingSec === null || prev === null) return;
    const thresholds: { sec: number; beeps: number }[] = [
      { sec: 180, beeps: 3 },
      { sec: 120, beeps: 2 },
      { sec: 60, beeps: 1 },
    ];
    for (const { sec, beeps } of thresholds) {
      if (prev > sec && activeRemainingSec <= sec) {
        for (let i = 0; i < beeps; i += 1) {
          playBeep(880, 250, i * 400);
        }
        break;
      }
    }
  }, [activeRemainingSec, beepEnabled, mode, fy.finished]);

  return (
    <section
      style={{
        width: "100%",
        maxWidth: "1800px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1.25rem",
      }}
    >
      <h1 style={{ margin: 0 }}>
        Dashboard{eventName ? ` — ${eventName}` : ""}
      </h1>

      <NowOsloRow now={now} eventLocation={location || eventLocation} />

      {replayAvailable && (
        <div
          role="group"
          aria-label="Replay controls"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setViewLoop(Math.max(1, (effectiveViewLoop ?? maxLoop) - 1));
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              setViewLoop(Math.min(maxLoop, (effectiveViewLoop ?? 0) + 1));
            } else if (e.key === "Home") {
              e.preventDefault();
              setViewLoop(1);
            } else if (e.key === "End") {
              e.preventDefault();
              setViewLoop(maxLoop);
            } else if (e.key.toLowerCase() === "l") {
              e.preventDefault();
              setViewLoop(null);
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            border: "1px solid #ddd",
            borderRadius: "0.4rem",
            background: inReplay ? "#fff7ed" : "#f3f3f3",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {inReplay ? "Replay" : "Race finished"}
          </span>
          <button
            type="button"
            onClick={() => setViewLoop(1)}
            disabled={inReplay && effectiveViewLoop === 1}
            title="First loop"
            aria-label="Jump to first loop"
            style={playbackBtn}
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={() =>
              setViewLoop(Math.max(1, (effectiveViewLoop ?? maxLoop) - 1))
            }
            disabled={inReplay && effectiveViewLoop === 1}
            title="Previous loop"
            aria-label="Previous loop"
            style={playbackBtn}
          >
            ◀
          </button>
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "5.5rem", textAlign: "center" }}>
            Loop {effectiveViewLoop ?? maxLoop} / {maxLoop}
          </span>
          <button
            type="button"
            onClick={() =>
              setViewLoop(Math.min(maxLoop, (effectiveViewLoop ?? 0) + 1))
            }
            disabled={inReplay && effectiveViewLoop === maxLoop}
            title="Next loop"
            aria-label="Next loop"
            style={playbackBtn}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => setViewLoop(maxLoop)}
            disabled={inReplay && effectiveViewLoop === maxLoop}
            title="Last loop"
            aria-label="Jump to last loop"
            style={playbackBtn}
          >
            ⏭
          </button>
          <button
            type="button"
            onClick={() => setViewLoop(null)}
            disabled={!inReplay}
            title="Live"
            aria-label="Resume live mode"
            style={{
              ...playbackBtn,
              marginLeft: "0.5rem",
              cursor: inReplay ? "pointer" : "default",
              opacity: inReplay ? 1 : 0.5,
            }}
          >
            Live
          </button>
        </div>
      )}

      {startInstant ? (
        <>
          <p style={{ margin: 0, color: "#555" }}>{label}</p>
          {(() => {
            const { signedDays, hms } = formatDuration(diffMs);
            const clockColor =
              signedDays < 0 ? "#c62828" : signedDays > 0 ? "#1f6feb" : "#117a3a";
            return (
              <div
                style={{
                  fontSize: "3.5rem",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                  color: clockColor,
                  letterSpacing: "0.02em",
                  display: "flex",
                  alignItems: "baseline",
                  gap: "1.5rem",
                }}
              >
                {signedDays !== 0 && <span>days = {signedDays}</span>}
                <span>{hms}</span>
              </div>
            );
          })()}
          <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>
            Start: {formatOslo(startInstant)} (Oslo) · Mode: {mode}
          </p>

          {mode === "backyard" && (
            <div
              style={{
                width: "100%",
                marginTop: "0.5rem",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <StatCard
                label="Loops completed"
                value={String(backyardCompleted)}
              bg="#117a3a" valueColor="white" labelColor="white" />
              <StatCard
                label="Current loop"
                value={beforeStart ? "—" : String(backyardCompleted + 1)}
              bg="#facc15" valueColor="black" labelColor="black" />
              <StatCard label="Loop time-limit (min)" value="60" bg="#dc2626" valueColor="white" labelColor="white" />
              <StatCard label="Next loop time-limit (min)" value="60" bg="#be0cfe" valueColor="white" labelColor="white" />
              <div style={{ flexBasis: "100%", height: 0 }} />
              <StatCard
                label="Distance completed"
                value={formatKm(backyardDistance)}
              valueColor="black" labelColor="black" />
              {(() => {
                const r = requiredPace(60, BACKYARD_LOOP_KM);
                return (
                  <StatCard
                    label="Speed min:sek per km"
                    value={`${r.pace}`}
                    sub={`(${r.kmh} km/t)`}
                  bg="#111111" valueColor="white" labelColor="white" />
                );
              })()}
              <StatCard
                label={
                  beforeStart
                    ? "Loop starts at race start"
                    : "Remaining min:sec of loop"
                }
                value={`${pad(remMin)}:${pad(remSec)}`}
                bg={beforeStart ? undefined : remainingBg(remainingInLoop)}
                valueColor="black"
                labelColor="black"
              />
              <div style={{ flexBasis: "100%", height: 0 }} />
              <StatCard label="Runners completed past loop" value={completedPastLoopValue} valueColor="black" labelColor="black" />
              <StatCard label="Runners starting this loop" value={startingThisLoopValue} valueColor="black" labelColor="black" />
            </div>
          )}

          {mode === "frontyard" && (
            <div
              style={{
                width: "100%",
                marginTop: "0.5rem",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <JerseyHoldersRow />
              <div style={{ flexBasis: "100%", height: 0 }} />
              {beforeStart ? (
                <>
                  <StatCard
                    label="Loops completed"
                    value="0"
                  bg="#117a3a" valueColor="white" labelColor="white" />
                  <StatCard label="Current loop" value="1" bg="#facc15" valueColor="black" labelColor="black" />
                  <StatCard
                    label="Loop time-limit (min)"
                    value={String(FRONTYARD_START_MIN)}
                  bg="#dc2626" valueColor="white" labelColor="white" />
                  {(() => {
                    const next = nextFrontyardLoopMin(1);
                    return (
                      <StatCard
                        label="Next loop time-limit (min)"
                        value={next === null ? "—" : String(next)}
                      bg="#be0cfe" valueColor="white" labelColor="white" />
                    );
                  })()}
                  <div style={{ flexBasis: "100%", height: 0 }} />
                  <StatCard
                    label="Distance (km) completed"
                    value={formatKm(0)}
                  valueColor="black" labelColor="black" />
                  {(() => {
                    const r = requiredPace(FRONTYARD_START_MIN, FRONTYARD_LOOP_KM);
                    return (
                      <StatCard
                        label="Speed min:sek per km"
                        value={`${r.pace}`}
                        sub={`(${r.kmh} km/t)`}
                      bg="#111111" valueColor="white" labelColor="white" />
                    );
                  })()}
                  <StatCard
                    label="Loop starts at race start"
                    value="30:00"
                  />
                  <div style={{ flexBasis: "100%", height: 0 }} />
                  <JerseyCard loopNumber={1} />
                  <StatCard label="Runners completed past loop" value={completedPastLoopValue} valueColor="black" labelColor="black" />
                  <StatCard label="Runners starting this loop" value={startingThisLoopValue} valueColor="black" labelColor="black" />
                </>
              ) : fy.finished ? (
                <>
                  <StatCard
                    label="Loops completed"
                    value={String(frontyardCompleted)}
                  bg="#117a3a" valueColor="white" labelColor="white" />
                  <StatCard label="Current loop" value="—" bg="#facc15" valueColor="black" labelColor="black" />
                  <StatCard label="Loop time-limit (min)" value="—" bg="#dc2626" valueColor="white" labelColor="white" />
                  <StatCard label="Next loop time-limit (min)" value="—" bg="#be0cfe" valueColor="white" labelColor="white" />
                  <div style={{ flexBasis: "100%", height: 0 }} />
                  <StatCard
                    label="Distance (km) completed"
                    value={formatKm(frontyardDistance)}
                  valueColor="black" labelColor="black" />
                  <StatCard
                    label="Speed min:sek per km"
                    value="—"
                    sub="(—)"
                  bg="#111111" valueColor="white" labelColor="white" />
                  <StatCard
                    label="Race finished"
                    value="00:00"
                    valueColor="#117a3a"
                  />
                  <div style={{ flexBasis: "100%", height: 0 }} />
                  <JerseyCard loopNumber={null} />
                  <StatCard label="Runners completed past loop" value={completedPastLoopValue} valueColor="black" labelColor="black" />
                  <StatCard label="Runners starting this loop" value={startingThisLoopValue} valueColor="black" labelColor="black" />
                </>
              ) : (
                <>
                  <StatCard
                    label="Loops completed"
                    value={String(frontyardCompleted)}
                  bg="#117a3a" valueColor="white" labelColor="white" />
                  <StatCard
                    label="Current loop"
                    value={String(fy.loopNumber)}
                  bg="#facc15" valueColor="black" labelColor="black" />
                  <StatCard
                    label="Loop time-limit (min)"
                    value={String(fy.loopLengthMin)}
                  bg="#dc2626" valueColor="white" labelColor="white" />
                  {(() => {
                    const next = nextFrontyardLoopMin(fy.loopNumber);
                    return (
                      <StatCard
                        label="Next loop time-limit (min)"
                        value={next === null ? "—" : String(next)}
                      bg="#be0cfe" valueColor="white" labelColor="white" />
                    );
                  })()}
                  <div style={{ flexBasis: "100%", height: 0 }} />
                  <StatCard
                    label="Distance completed"
                    value={formatKm(frontyardDistance)}
                  valueColor="black" labelColor="black" />
                  {(() => {
                    const r = requiredPace(fy.loopLengthMin, FRONTYARD_LOOP_KM);
                    return (
                      <StatCard
                        label="Speed min:sek per km"
                        value={`${r.pace}`}
                        sub={`(${r.kmh} km/t)`}
                      bg="#111111" valueColor="white" labelColor="white" />
                    );
                  })()}
                  <StatCard
                    label="Remaining min:sec of loop"
                    value={`${pad(fyMin)}:${pad(fySec)}`}
                    bg={remainingBg(fy.remainingSec)}
                    valueColor="black"
                    labelColor="black"
                  />
                  <div style={{ flexBasis: "100%", height: 0 }} />
                  <JerseyCard loopNumber={fy.loopNumber} />
                  <StatCard label="Runners completed past loop" value={completedPastLoopValue} valueColor="black" labelColor="black" />
                  <StatCard label="Runners starting this loop" value={startingThisLoopValue} valueColor="black" labelColor="black" />
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <p style={{ color: "#888" }}>
          Set the race start time in the Settings dashboard to start the clock.
        </p>
      )}
    </section>
  );
}
