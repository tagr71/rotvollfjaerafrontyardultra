# UltraLoopTimer — Connect IQ Data Field

A full-screen Connect IQ data field for fixed-duration "timed" ultras —
6, 12 or 24 hour events on a fixed loop course.

Built for **fenix 7X** and **Forerunner 965** (Connect IQ SDK 9.1).

## Two apps, one source

The project ships as two independently-installable Connect IQ apps that
share the same source code but have different launcher names and
default-mode settings, so you can sideload **both** to the same watch
and pick the right one per activity:

| App on the watch | Default mode | Manifest | Jungle |
|------------------|--------------|----------|--------|
| **UltraLoopTimer**   | runner  | `manifest.xml`         | `monkey.jungle`         |
| **UltraLoop Support**| support | `manifest-support.xml` | `monkey-support.jungle` |

Both apps still expose the `supportMode` setting, so either default can
be overridden later in Garmin Connect. The split exists so the two
flavours have different app IDs (the watch keeps Connect IQ apps
separate by id, not by name).

## Modes

Toggled by the `supportMode` setting:

- **Runner mode** (`supportMode = false`) — silent runner view.
  Distance and pace come **strictly from GPS** (`info.elapsedDistance`,
  `info.currentSpeed`). When the watch isn't moving everything reads
  `0:00` / `0.00 km`. No fallback simulation.
- **Support mode** (`supportMode = true`) — crew view. Distance is
  derived from a manual loop count (the support crew presses the lap
  button on each completed loop) times the configured loop length.
  Live page of pacer dots showing how the runner is doing vs two
  fictive pacers (green / red).

## Runner-mode display

Around the bezel: a single ring of `loopsPerCircle` numeric ticks
(default **8**) labeling the current window — `1..8`, then `9..16`,
then `17..24`, …

A single **blue dot** slides smoothly around the ring at angular
position

$$
\text{frac} \;=\;
\frac{\text{totalDistanceM} \bmod (\text{loopsPerCircle}\cdot \text{loopMeters})}{\text{loopsPerCircle}\cdot \text{loopMeters}}
$$

so position is purely distance-driven (no time interpolation).

Inside the ring, a hero text stack:

| Row | Position | Value | Size | Color |
|-----|----------|-------|------|-------|
| 1 | top inset    | race time remaining `HH:MM:SS` | small     | fg* |
| 2 | center top   | average pace `M:SS /km`        | **large** | fg* |
| 3 | center mid   | live loop pace `M:SS /lp`      | **large** | fg* |
| 4 | center bot   | average loop `avg M:SS /lp`    | **large** | **blue** |
| 5 | bottom inset | total distance `NN.NN km`      | small     | fg* |

\* `fg` auto-adapts to the data-field background: **black on light**
faces, **white on dark** faces (chosen from `getBackgroundColor()`).

The live loop pace (row 3) is computed from `info.currentSpeed`
(`loopMeters / speed`). The average loop (row 4) is computed from total
distance and elapsed time so it is meaningful before the first full
loop completes.

Runner mode is **completely silent**: the lap button does nothing, no
beeps, no vibrations. When the race timer hits `0:00:00` the field
shows `DONE` silently.

## Support-mode display

Around the bezel: a sliding window of `loopsPerCircle` numeric ticks.
The window advances when the **fastest of {blue actual runner, green
fictive runner}** crosses the next multiple of `loopsPerCircle` — red
can lag visibly behind on the same page (which is the point: the crew
sees how far behind the slower pacer the runner is).

Runner dots on the ring:

| Dot | Color | Meaning | Pace |
|-----|-------|---------|------|
| Real runner | **blue** | sits at the ring tick of the most recently completed loop and **only jumps to the next tick when the lap button is pressed** | from lap presses |
| Fictive 1   | **green** | fastest pacer | `raceSec / fastRunnerKm` (default 4:05 /km from 88 km in 6 h) |
| Fictive 2   | **red**   | slowest pacer | `raceSec / slowRunnerKm` (default 4:30 /km from 80 km in 6 h) |

A third **yellow** pacer is computed (midpoint of green and red) but
has no dot on the ring. Its pace is used only for the silent
every-loop crew vibe.

Each dot has its **completed-loop count drawn in black** on top of the
colored dot (readable on any face). Small **blue lap markers** sit on
the ring for each loop the runner has completed in the current window
(they reset when the window advances).

A gentle vibe fires every **yellow-pace loop** — a passive
"runner is at midpoint pace" cue for the crew.

Inside the ring (top to bottom). All text rows use `fg`, which auto-
adapts to the data-field background (**black on light**, **white on
dark**):

| Row | Value | Size |
|-----|-------|------|
| 1 | Loop count + current-loop stopwatch  `N  M:SS` | large |
| 2 | Loop pace                              `M:SS/km` | large |
| 3 | Distance + projected end               `X.X / ~Y.Y km` | medium |
| 4 | Race countdown                         `HH:MM:SS` | large |

- The row-1 stopwatch counts up from the most recent lap-button press
  (before any press: total elapsed time).
- The pace row only refreshes when the lap button is pressed and is
  derived from the duration of the most recently completed loop
  (`paceMinPerKm = lastLoopSec / 60 × 1000 / loopMeters`). Before the
  first lap press it shows `--:--/km`.
- The `~Y.Y` projection on the distance row is the projected total at
  finish:

  $$ \text{proj}\;\text{km} = \text{doneKm} + \frac{\text{remainingSec}}{\text{avgLoopSec}} \cdot \frac{\text{loopMeters}}{1000} $$

  The `~Y.Y` segment is omitted before the first lap press, when there
  is no pace estimate yet.

## Lap-press correction (support mode)

Within a sliding window of `correctionWindowSec` seconds (default 10 s)
each lap-button press joins a "burst". When the window expires the
burst is finalized:

| Presses | Effect | Bells |
|---------|--------|-------|
| 1 | +1 loop (normal lap) | 3 |
| 2 | +2 loops (missed lap caught) | 2 |
| 3 or more | −1 loop (undo last lap, one level deep) | 1 |

Each individual press also fires one short bell so the operator knows
the press was registered.

## Carb / fueling alert (support mode)

A scheduled-serving model: every hour is split into
`carbServingsPerHour` evenly-spaced servings of
`carbsPerHourGrams / carbServingsPerHour` grams each. Each serving has
a fixed due time `dueAt = servingIndex × (3600 / carbServingsPerHour)`.

When `elapsed ≥ dueAt − carbServingAlarmSec` an orange `FUEL Ng` pill
is drawn below the countdown and a 2-bell + 2-vibe alert fires once.
The pill stays on screen until the next lap-button press (normal or
double press), which counts the serving as taken and advances the
schedule. An *undo* burst (3+ presses) does **not** cancel an already-
served carb.

Because the icon latches until acknowledged, a late-finishing loop
still gets fueled on the upcoming lap.

## Other alerts (support mode)

- **1 minute remaining** — 1 beep + 1 buzz
- **Race finish** — 3 beeps + 3 buzzes

## Settings

In Garmin Connect → Connect IQ Apps → *UltraLoopTimer* or
*UltraLoop Support* → Settings:

| Key | Default | Range | Meaning |
|-----|---------|-------|---------|
| `supportMode`          | runner: `false`, support: `true` | bool | `true` = crew pacer view, `false` = runner view |
| `raceHours`            | 6       | 6 / 12 / 24 | Race duration in hours |
| `loopMeters`           | 1185.6  | 1 – 100000 | Length of one loop in meters |
| `loopsPerCircle`       | 8       | 1 – 50    | Loops per full ring revolution |
| `correctionWindowSec`  | 10      | 1 – 20    | Lap-burst window in seconds |
| `fastRunnerKm`         | 88      | 1 – 500   | GREEN pacer's total race-distance goal (km); pace = `raceSec / km` |
| `slowRunnerKm`         | 80      | 1 – 500   | RED pacer's total race-distance goal (km); clamped ≤ `fastRunnerKm` |
| `carbsPerHourGrams`    | 90      | 0 – 200   | Total grams of carbs per hour |
| `carbServingsPerHour`  | 6       | 1 – 30    | Servings per hour (so each serving = `grams / servings`) |
| `carbServingAlarmSec`  | 60      | 10 – 600  | Lead time (seconds) before each scheduled serving at which the FUEL alarm fires |

The per-app `supportMode` defaults live in
`resources-runner-default/settings/properties.xml` and
`resources-support-default/settings/properties.xml` and are layered on
top of the shared `resources/settings/properties.xml` by each jungle
file.

## Build

Requires the [Connect IQ SDK](https://developer.garmin.com/connect-iq/)
and a developer key.

```powershell
# from this folder
$sdk = "$env:APPDATA\Garmin\ConnectIQ\Sdks\connectiq-sdk-win-9.1.0-2026-03-09-6a872a80b"
$key = "$env:APPDATA\Garmin\ConnectIQ\developer_key.der"

# Runner (UltraLoopTimer)
& "$sdk\bin\monkeyc.bat" -d fenix7x -f monkey.jungle         -o bin\UltraLoopTimer-Runner-fenix7x.prg  -y $key
& "$sdk\bin\monkeyc.bat" -d fr965   -f monkey.jungle         -o bin\UltraLoopTimer-Runner-fr965.prg    -y $key

# Support (UltraLoop Support)
& "$sdk\bin\monkeyc.bat" -d fenix7x -f monkey-support.jungle -o bin\UltraLoopTimer-Support-fenix7x.prg -y $key
& "$sdk\bin\monkeyc.bat" -d fr965   -f monkey-support.jungle -o bin\UltraLoopTimer-Support-fr965.prg   -y $key
```

This produces four `.prg` files in `bin/`:

| File | Device | Watch label |
|------|--------|-------------|
| `UltraLoopTimer-Runner-fenix7x.prg`  | fenix 7X | UltraLoopTimer    |
| `UltraLoopTimer-Runner-fr965.prg`    | fr965    | UltraLoopTimer    |
| `UltraLoopTimer-Support-fenix7x.prg` | fenix 7X | UltraLoop Support |
| `UltraLoopTimer-Support-fr965.prg`   | fr965    | UltraLoop Support |

## Sideload

1. Connect the watch over USB.
2. Copy the `.prg` files matching your device to `GARMIN\APPS\` on the
   watch (you can copy both Runner and Support to the same watch — they
   have different Connect IQ app IDs).
3. Safely eject.
4. On the watch: **START** → activity (e.g. **Run**) → **MENU** →
   **Settings → Data Screens** → pick a screen →
   **Layout → Single field (Connect IQ)** →
   **Edit Fields → Connect IQ → UltraLoopTimer** (or **UltraLoop
   Support**).

## Simulator

```powershell
& "$sdk\bin\connectiq.bat"
& "$sdk\bin\monkeydo.bat" "<abs path>\bin\UltraLoopTimer-Runner-fr965.prg" fr965
```

The simulator caches app properties in
`%LOCALAPPDATA%\Temp\com.garmin.connectiq\GARMIN\APPS\SETTINGS\ULTRALOOPTIMER.SET`.
Delete that file to reset to the defaults from the active jungle's
properties layer.

In the simulator runner mode is strictly GPS-driven, so to see distance
and pace move you need to feed the simulator activity data:
**Simulation → Activity Data → Edit…** (or load a FIT / GPX). With no
input it correctly shows `0:00 /km`, `0:00 /lp`, `avg 0:00 /lp` and
`0.00 km`.

Support mode also requires the simulator activity timer to be running
(so `elapsedTime` ticks) for the green/red fictive pacer dots to move.
The blue actual-runner dot only moves on lap-button presses - use the
sim's lap-button shortcut to advance it to the next tick.

## Status

- **Runner mode** (default for `UltraLoopTimer`): minimalist hero stack
  (countdown, avg-pace /km, live-loop /lp, avg-loop /lp in blue,
  distance), distance-driven blue dot in a `loopsPerCircle`-loop
  window, strictly GPS-driven, fully silent. Text colors auto-adapt to
  the data-field background.
- **Support mode** (default for `UltraLoop Support`): pacer-dot ring
  (green + red, paces derived from `fastRunnerKm` / `slowRunnerKm` and
  `raceHours`), blue actual-runner dot that **sits at the most
  recently completed loop tick and only jumps forward when the lap
  button is pressed**, in-dot loop counts, fastest-of-{blue,green}
  window advance, loop/avg/projection stats, lap-burst correction,
  scheduled-carb FUEL alarm, and a silent every-loop crew vibe at the
  midpoint (yellow) pace. Text rows also auto-adapt to background.
- Supported devices: **fenix 7X**, **Forerunner 965**. Add more by
  appending `<iq:product id="..."/>` lines in both manifests once the
  layout has been verified on the target screen size.
