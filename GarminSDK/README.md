# Tage Yard Timer — Connect IQ Data Field

A full-screen Connect IQ data field for Garmin watches (Fenix 7 family,
Epix 2 family, FR955/965) that helps you pace **Backyard-style** and
**Frontyard-style** loop races when the watch firmware does not expose
Workout Step Name, Workout Notes, or "Time to Next Repeat" to data
fields.

It uses only the activity's **elapsed time** and **elapsed distance** to
compute everything — no workout file required.

## Features at a glance

- **Loop scheduler** — handles both classic Backyard Ultra (constant
  loop length) and Frontyard / Rotvollfjæra (shrinking loops) from
  four numbers: `firstLoopMin`, `holdLoop`, `maxLoops`, `loopMeters`.
- **Full-screen visual pacer** — green countdown donut around the
  bezel, with auto-scaled kilometre marks (0.5/1/1.5 … km).
- **Two runner dots** — white = you (position from elapsed distance),
  yellow = a "perfect-pace" ghost runner that finishes the loop
  exactly at 0:00. White is drawn on top of yellow.
- **Live gap readout** — metres ahead (green) or behind (red) the
  yellow pacer, plus required loop pace and running average pace.
- **3 / 2 / 1 min warnings** — blue dots on the donut and audible
  beeps + vibration; another 3-beep alert at every new loop and at
  race finish.
- **Loop counter highlights** — pink at loop 10, green at loop 15,
  yellow on the final loop.
- **Settings via Garmin Connect** — no rebuild needed to switch
  between backyard and frontyard presets.
- **Self-contained** — no workout `.fit` file, no GPS course, no
  network permissions required.

## What it shows

A green countdown donut around the bezel and, inside it, top to bottom:

- **Green donut** — sweeps clockwise as time in the current loop elapses;
  fully closed at 0:00.
- **Distance labels** around the donut — `0.5 / 1 / 1.5 …` km marks for
  short loops (≤ 3.5 km), `1 / 2 / 3 …` km for medium loops, and
  `2 / 4 / 6 …` km for very long loops. Always drawn on top of the
  donut and the runner dots.
- **Three blue markers on the donut** — at 3 / 2 / 1 min remaining of
  the current loop (skipped if a threshold is longer than the loop).
- **Yellow pacer dot** — a fictive runner moving at exactly the
  required average pace to reach the loop deadline right at 0:00.
  Its angular position equals `elapsed_in_loop / loop_duration`.
- **White runner dot** (black contour) — your actual position. One full
  lap of the dot equals one configured loop distance (`loopMeters`).
  Ahead of the yellow dot = ahead of pace. The white dot is drawn on
  top of the yellow dot when they overlap.
- **`n/max`** — current loop / total loops. **PINK** at loop 10,
  **GREEN** at loop 15, **YELLOW** on the final loop (`maxLoops`),
  **BLUE** otherwise.
- **`MM:SS`** (red) — time remaining in the current loop, with the
  `min to next` caption.
- **`min/km`** (blue) — required pace for this loop.
- **`HH:MM:SS`** — current clock time.
- **`bpm  ±Nm  min/km`** (XTINY) — current heart rate (red), the gap
  in metres between the white and yellow dots (**green** when ahead,
  **red** when behind, `--m` before the first loop starts), and the
  running average pace (red).
- **`HH:MM:SS` + `next loop`** (blue, small) — predicted clock time
  of the next loop start (hidden until the activity timer is running).

All five inner rows are laid out with equidistant vertical gaps and
inset from the donut so nothing touches the ring.

When elapsed time passes the final loop the field shows `DONE <max>`
and the dynamic values become dashes.

## Audio + vibration alerts

| Event | Pattern |
|-------|---------|
| 3 min remaining | 3 beeps + 3 buzzes |
| 2 min remaining | 2 beeps + 2 buzzes |
| 1 min remaining | 1 beep  + 1 buzz |
| **New loop starts** | 3 beeps + 3 buzzes |
| Race finished | 3 beeps + 3 buzzes |

Tones only sound on watches with a speaker (e.g. fenix 7 Pro, fenix 8,
FR165/265/955/965, Venu). Watches without a speaker still vibrate.

## Schedule logic

```
loop_minutes(loop) = first_loop_min + 1 − min(loop, hold_loop)
```

- **Backyard ultra** (constant loop length): set `holdLoop = 1`.
  Every loop is then `firstLoopMin` minutes (e.g. `firstLoopMin = 60`
  for a standard backyard).
- **Frontyard / Rotvollfjæra** (shrinking loops): defaults
  `firstLoopMin = 30`, `holdLoop = 17`, `maxLoops = 27`,
  `loopMeters = 3000` → loop 1 = 30 min, loop 2 = 29 min, …,
  loop 16 = 15 min, loops 17–27 = 14 min.

## Settings

Garmin Connect app → **Connect IQ Apps** → **Tage Yard Timer** →
**Settings**:

| Key | Default | Meaning |
|-----|---------|---------|
| `firstLoopMin` | 30 | Length of loop 1 in minutes |
| `holdLoop`     | 17 | Loop where the pace floor is reached (set to `1` for a constant-length backyard) |
| `maxLoops`     | 27 | Total number of loops to plan for |
| `loopMeters`   | 3000 | Length of one loop in meters (e.g. `6706` for a standard backyard) |

### Standard backyard preset

| Key | Value |
|-----|-------|
| `firstLoopMin` | 60 |
| `holdLoop` | 1 |
| `maxLoops` | 48 (or higher) |
| `loopMeters` | 6706 |

## Build

Requires the [Connect IQ SDK](https://developer.garmin.com/connect-iq/)
(tested with 9.1) and a developer key.

```powershell
# from this folder
$sdk = "$env:APPDATA\Garmin\ConnectIQ\Sdks\connectiq-sdk-win-9.1.0-2026-03-09-6a872a80b"
& "$sdk\bin\monkeyc.bat" `
    -d fenix7 `
    -f monkey.jungle `
    -o bin\TageYardTimer.prg `
    -y $env:APPDATA\Garmin\ConnectIQ\developer_key.der
```

## Sideload

1. Connect the watch over USB.
2. Copy `bin/TageYardTimer.prg` to `GARMIN\APPS\` on the watch.
3. Safely eject.
4. On the watch: **START** → activity (e.g. **Run**) → **MENU** →
   **Settings → Data Screens** → pick a screen →
   **Layout → Single field (Connect IQ)** →
   **Edit Fields → Connect IQ → Tage Yard Timer**.

## Simulator

```powershell
& "$sdk\bin\connectiq.bat"
& "$sdk\bin\monkeydo.bat" bin\TageYardTimer.prg fenix7
```

To hear/feel the alerts in the simulator, enable
**Settings → Audible Alerts** and **Settings → Vibration**
in the simulator's menu bar.

The simulator caches app properties in
`%LOCALAPPDATA%\Temp\com.garmin.connectiq\GARMIN\APPS\SETTINGS\`. Delete
that folder to reset to the defaults compiled from
`resources/settings/properties.xml`.
