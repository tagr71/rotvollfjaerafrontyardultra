import { useEffect, useState } from "react";
import type React from "react";

export const OSLO_TZ = "Europe/Oslo";
export const LOOP_SECONDS = 60 * 60; // 60 minutes per loop in Backyard mode
export const FRONTYARD_START_MIN = 30; // first loop in Frontyard mode is 30 minutes
export const FRONTYARD_LOCK_DEFAULT = 17;
export const FRONTYARD_MAX_DEFAULT = 27;
export const FRONTYARD_LOCK_MIN = 1;
export const FRONTYARD_LOCK_MAX = 29;
export const FRONTYARD_MAX_CAP = 60;
export const BACKYARD_LOOP_KM = 6.706;
export const FRONTYARD_LOOP_KM = 3;

export type Mode = "backyard" | "frontyard";

/** Frontyard: loops shrink 30, 29, ..., until loop `lockAfter` whose length
 * is reused for every later loop. The race ends after `maxLoops` loops. */
export function frontyardState(
  elapsedSec: number,
  lockAfter: number,
  maxLoops: number,
): {
  loopsCompleted: number;
  loopNumber: number;
  loopLengthMin: number;
  remainingSec: number;
  finished: boolean;
} {
  const lockedLen = Math.max(1, FRONTYARD_START_MIN + 1 - lockAfter);
  let loopsCompleted = 0;
  let loopStart = 0;
  for (let k = 1; k <= maxLoops; k += 1) {
    const naturalLen = Math.max(1, FRONTYARD_START_MIN + 1 - k);
    const len = k <= lockAfter ? naturalLen : lockedLen;
    const loopEnd = loopStart + len * 60;
    if (elapsedSec < loopEnd) {
      return {
        loopsCompleted,
        loopNumber: k,
        loopLengthMin: len,
        remainingSec: loopEnd - elapsedSec,
        finished: false,
      };
    }
    loopsCompleted += 1;
    loopStart = loopEnd;
  }
  return {
    loopsCompleted,
    loopNumber: maxLoops,
    loopLengthMin: 0,
    remainingSec: 0,
    finished: true,
  };
}

export function startTimeKey(eventId: string) {
  return `raceresult.startTime.${eventId}`;
}
export function modeKey(eventId: string) {
  return `raceresult.timerMode.${eventId}`;
}
export function lockKey(eventId: string) {
  return `raceresult.timerFrontyardLock.${eventId}`;
}
export function maxLoopsKey(eventId: string) {
  return `raceresult.timerFrontyardMax.${eventId}`;
}
export function beepKey(eventId: string) {
  return `raceresult.timerBeep.${eventId}`;
}

function readIntSetting(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function formatDuration(totalMs: number): { signedDays: number; hms: string } {
  const sign = totalMs < 0 ? -1 : 1;
  const totalSeconds = Math.floor(Math.abs(totalMs) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    signedDays: sign * days,
    hms: `${pad(hours)}.${pad(minutes)}.${pad(seconds)}`,
  };
}

export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`;
}

function osloOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OSLO_TZ,
    timeZoneName: "shortOffset",
  }).formatToParts(instant);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = tz.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 60;
  const h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  const sign = h < 0 ? -1 : 1;
  return h * 60 + sign * mm;
}

/** Interpret a `datetime-local` value as Oslo wall-clock time and return
 * the corresponding UTC instant. */
export function osloWallClockToInstant(value: string): Date | null {
  if (!value) return null;
  const m = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const utcGuess = Date.UTC(
    parseInt(y, 10),
    parseInt(mo, 10) - 1,
    parseInt(d, 10),
    parseInt(h, 10),
    parseInt(mi, 10),
    s ? parseInt(s, 10) : 0,
  );
  const off1 = osloOffsetMinutes(new Date(utcGuess));
  const instant1 = utcGuess - off1 * 60 * 1000;
  const off2 = osloOffsetMinutes(new Date(instant1));
  return new Date(utcGuess - off2 * 60 * 1000);
}

export function formatOslo(instant: Date): string {
  const { date, time } = formatOsloParts(instant);
  return `${date} ${time}`;
}

/** Format an instant in Oslo as { date: "yyyy-mm-dd", time: "HH.mm.ss" }. */
export function formatOsloParts(instant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OSLO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}.${get("minute")}.${get("second")}`,
  };
}

export const panel: React.CSSProperties = {
  flex: "1 1 0",
  minWidth: "13rem",
  padding: "1.6rem 1.75rem",
  border: "1px solid #ddd",
  borderRadius: "0.75rem",
  background: "#fafafa",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.6rem",
};

export const bigClock: React.CSSProperties = {
  fontSize: "3.6rem",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 600,
  color: "#b8860b",
};

const panelLabel: React.CSSProperties = {
  margin: 0,
  color: "#555",
  fontSize: "1.15rem",
  textAlign: "center",
};

const panelSub: React.CSSProperties = {
  margin: 0,
  color: "#888",
  fontSize: "1rem",
};

export function StatCard({
  label,
  value,
  valueColor,
  sub,
  bg,
  labelColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
  bg?: string;
  labelColor?: string;
}) {
  return (
    <div style={{ ...panel, background: bg ?? panel.background }}>
      <p style={{ ...panelLabel, color: labelColor ?? panelLabel.color }}>{label}</p>
      <div style={{ ...bigClock, color: valueColor ?? bigClock.color }}>{value}</div>
      {sub && <p style={panelSub}>{sub}</p>}
    </div>
  );
}

/** Shared 1-second clock tick. */
export function useNowTick(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Reads settings from localStorage and re-reads on a periodic poll so the
 * display dashboard reflects edits made on the setup dashboard. */
export function useTimerSettings(eventId: string) {
  const [startTime, setStartTime] = useState<string>(
    () => localStorage.getItem(startTimeKey(eventId)) ?? "",
  );
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem(modeKey(eventId)) as Mode | null) ?? "backyard",
  );
  const [fyLock, setFyLock] = useState<number>(
    () => readIntSetting(lockKey(eventId), FRONTYARD_LOCK_DEFAULT),
  );
  const [fyMax, setFyMax] = useState<number>(
    () => readIntSetting(maxLoopsKey(eventId), FRONTYARD_MAX_DEFAULT),
  );
  const [beepEnabled, setBeepEnabled] = useState<boolean>(
    () => localStorage.getItem(beepKey(eventId)) === "1",
  );

  function reload() {
    setStartTime(localStorage.getItem(startTimeKey(eventId)) ?? "");
    setMode((localStorage.getItem(modeKey(eventId)) as Mode | null) ?? "backyard");
    setFyLock(readIntSetting(lockKey(eventId), FRONTYARD_LOCK_DEFAULT));
    setFyMax(readIntSetting(maxLoopsKey(eventId), FRONTYARD_MAX_DEFAULT));
    setBeepEnabled(localStorage.getItem(beepKey(eventId)) === "1");
  }

  useEffect(() => {
    reload();
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key === startTimeKey(eventId) ||
        e.key === modeKey(eventId) ||
        e.key === lockKey(eventId) ||
        e.key === maxLoopsKey(eventId) ||
        e.key === beepKey(eventId)
      ) {
        reload();
      }
    };
    window.addEventListener("storage", onStorage);
    const id = window.setInterval(reload, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return {
    startTime,
    setStartTime,
    mode,
    setMode,
    fyLock,
    setFyLock,
    fyMax,
    setFyMax,
    beepEnabled,
    setBeepEnabled,
  };
}

/** Play a short beep tone via Web Audio. Returns true on success. */
let _audioCtx: AudioContext | null = null;
export function playBeep(frequency = 880, durationMs = 250) {
  try {
    if (!_audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return false;
      _audioCtx = new Ctor();
    }
    const ctx = _audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + durationMs / 1000,
    );
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    return true;
  } catch {
    return false;
  }
}

const nowRowStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #eee",
  borderRadius: "0.4rem",
  background: "#fafafa",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "0.75rem",
  fontVariantNumeric: "tabular-nums",
};

export function NowOsloRow({ now }: { now: Date }) {
  const parts = formatOsloParts(now);
  return (
    <div style={nowRowStyle}>
      <span style={{ color: "#888", fontSize: "0.85rem" }}>Now (Oslo)</span>
      <span style={{ fontSize: "1.1rem" }}>
        {parts.date} &nbsp; {parts.time}
      </span>
    </div>
  );
}
