# Tick system — flow

How the panel re-renders: the animation heartbeat, the row clock, and the DB
scan path — and why glyphs animate at full speed while rows and scans stay
cheap. Line references point at `src/` as of the performance fix.

All clock values live in one place: `src/pware.oc.core/pware.oc.core.timing.ts`
(`TICK_MS`, `GLYPH_TICK_MS`, `NOW_MS`, `FPS_READ_EVERY_TICKS`, `BLINK_TICKS`,
`MONITOR_POLL_MS`, `MONITOR_WATCH_DEBOUNCE_MS`, `EVENT_SCAN_DEBOUNCE_MS`).

## 1. The four render triggers

The panel has four independent clocks/sources. **All run on the same event
loop thread.**

```
┌────────────────────────────────────────────────────────────────┐
│  SOURCE 1: TICK (row clock)                 sidebar.tsx          │
│    setInterval(..., TICK_MS = 300ms)                            │
│    → setNow()  (coarse — advances at most every NOW_MS = 1s)    │
│    → setFrame() (advances every tick — glyph blink phase)       │
│    → every FPS_READ_EVERY_TICKS (6) ticks: readRendererFps()    │
├────────────────────────────────────────────────────────────────┤
│  SOURCE 2: GLYPH TICK (fast animation)      sidebar.tsx          │
│    setInterval(..., GLYPH_TICK_MS = 80ms)                       │
│    → setGlyphFrame() (advances every 80ms — spinner + flow)     │
├────────────────────────────────────────────────────────────────┤
│  SOURCE 3: RUNTIME SOURCE                  runtime.source.ts      │
│    monitor poll/watch in monitor.ts emit pware.oes.snapshot      │
│    + refresh hints (pware.oes.refresh.hint / pware.omo.*)        │
│      debounced by EVENT_SCAN_DEBOUNCE_MS → monitor.refresh()     │
│    fingerprint-gated readRuntimeSnapshot only when changed        │
├────────────────────────────────────────────────────────────────┤
│  SOURCE 4: HOST EVENTS ADAPTER            pware.oc.ui.live.tsx   │
│    PANEL_HOST_TYPES via api.event.on                            │
│    → hostEventToOcEvents() → bus emits pware.oc.*               │
│    → shouldRefreshDb(type) emits pware.oes.refresh.hint          │
│    sidebar subscribes to pware.oc.* and updates live signals     │
└────────────────────────────────────────────────────────────────┘
         all four → synchronous Solid reactive cascade
                                       ↓
                          requestRender() (async)
                                       ↓
                          TUI renderer (measured fps)
```

## 2. Anatomy of one tick (300ms)

```
setInterval(TICK_MS = 300)                       ── sidebar.tsx
│
├─ selfTime("tick", ...)                         ── measured, now ~10-30ms
│  │
│  ├─ setNow(prev => …)                          ── CASCADE A (now consumers)
│  │    advances only when a full second passed;
│  │    returning `prev` skips the Solid cascade entirely
│  │
│  └─ setFrame(n => n + 1)                       ── CASCADE B (blink consumers)
│       re-renders ONLY the glyph2 blink leaves
│
├─ tickCount % FPS_READ_EVERY_TICKS === 0 ?     ── every 1800ms
│  └─ readRendererFps(api.renderer)             ── perf.self.ts
│     ├─ getStats().fps
│     └─ fallback getNativeStats().averageFrameTime
│     └─ setSelfFps(fps, frameMs)
```

The spinners and direction flows no longer wait for this tick: a second,
80ms clock drives them (section 4).

**Why it is cheap:** Solid tracks signal reads per binding. `frame` is passed
down as an *accessor* (`() => number`) and read **only inside the glyph
bindings** of `AgentLine` (`sections.tsx`) — the glyph2 blink colour. The row
body (`name`/`tokens`/`suffix` formatting in `rest()`) never reads `frame`, so
a tick re-renders just the glyph nodes, not the rows.

## 3. CASCADE A — `now()` consumers (recompute at most 1×/s)

`now` advances only on a full-second boundary, so every memo below recomputes
at most once per second instead of at every tick (3.3×/s before the fix):

```
setNow(prev => (Date.now() - prev >= NOW_MS ? Date.now() : prev))
│
├─ rowMark() / pulseAgeMs(now, ...)              sidebar.tsx
│   ├─ mainMark / currentMark / delegateMark  ─ agent rows
│   └─ session ages in JSX
├─ rowFlow() → activeFlow(..., now(), ...)
├─ myWorkApprovals → re-scan plans (cache TTL 2s)
├─ tool rows      → formatDuration(now - startedAt)
├─ selfLine       → formatSelfLine(readSelfStats())
└─ selfPhaseMs    → phaseAgeMs(flow, now, ...)
```

Displayed ages and durations already round to whole seconds
(`formatCoarseSec`), so 1s granularity is invisible to the user.

## 4. CASCADE B — `frame()` consumers (blink only, rows untouched)

```
setFrame(n + 1)                                  ── every 300ms
│
└─ Row helper (sidebar.tsx): frame={frame}       ← accessor, NOT frame()
│
└─ AgentLine (sections.tsx):
    ├─ direction glyph → dirFg() → flowBlinkOn(frame())  ← static arrow/clock blinks
    └─ glyph2 colour → glyphFg() → lit() → flowBlinkOn(frame())
```

## 4b. CASCADE C — `glyphFrame()` consumers (animate every 80ms, rows untouched)

```
setGlyphFrame(n + 1)                             ── every GLYPH_TICK_MS = 80ms
│
└─ Row helper (sidebar.tsx): glyphFrame={glyphFrame}   ← accessor
│
└─ AgentLine (sections.tsx):
    └─ glyphs() → rowGlyphs(mark, glyphFrame(), flow)
         └─ state glyph → spinnerFrame(glyphFrame())   ← braille spinner
    └─ PerfPanel (perf.view.tsx): live spinner → spinnerFrame(glyphFrame())
```

The direction glyph is **not** animated: it is a static arrow (or the ◷ waiting
clock, `directionGlyph`) that blinks on the slow `frame` tick instead — same
shape as the arrow blink below.

`frame` and `glyphFrame` are never read at row-construction scope (the
`RowList`/`For` callbacks), so lists are **not** rebuilt per glyph tick. The
spinner (10 frames) steps at 80ms — 0.8s per loop, close to the cli-spinners
cadence — while the direction glyph blink stays at 600ms and row data still
runs on the coarse clocks. The `PerfPanel` live glyph reads `glyphFrame()` at
the leaf, the panel body does not.

## 5. Why the numbers were 3fps, and what changed

Before the fix, every 300ms tick rebuilt the whole row tree (285ms) and every
db-refresh event forced a full DB read (353ms) — the UI thread was busy ~100%.
Now:

```
Idle state (no activity):
  tick(300ms)      | glyph leaves only, ~10-30ms |
  poll(1500ms)     |--- fingerprint (stat calls) ----------| 0ms when unchanged
  renderer         |            full speed                  |

Active state (streaming / tool calls):
  tick(300ms)      | glyph leaves | glyph leaves | glyph leaves | ...
  events           | scan (cache hit ~10ms) | ... only a full read
                   | (~30-150ms) when the visible data actually changed
  renderer         |            no longer starved            |
```

```
UI thread (1s of active work, after the fix):
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ g    │ g    │ g    │ g    │ g    │ g+row│ g    │ g    │ g    │ g    │
│ 15ms │ 15ms │ 15ms │ 15ms │ 15ms │ 25ms │ 15ms │ 15ms │ 15ms │ 15ms │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
   g = glyph-only tick   g+row = tick + coarse now (1×/s) re-renders rows
   + occasional scan (~30-150ms) when tools/files/sessions actually change
```

## 6. How a scan lands on the same thread (cache-gated now)

```
host event (e.g. session.next.tool.called)
  → startHostEventBridge()    pware.oc.ui.live.tsx
  → hostEventToOcEvents()     pware.oc.opencode.events.ts
  → bus.emit(pware.oc.*)      sidebar subscribers update live signals
  → shouldRefreshDb(type)?    events.ts
  → bus.emit(pware.oes.refresh.hint)
  → runtime source debounce 100ms (EVENT_SCAN_DEBOUNCE_MS)
  → monitor.refresh()         = emit(true)
  → readRuntimeSnapshot       runtime/resolver/index.ts
      ├─ computeFingerprint   (stat stamps: db file, omo/oes/gitignore)
      ├─ snapshotGraphStamp   (4 cheap SQL: session row + parts max +
      │                        children max + non-archived mains max)
      ├─ cache peek keyed by `${fingerprint}::${graphStamp}`
      │    ├─ HIT  → fresh ages + generatedAt, return  (~5-20ms)
      │    └─ MISS → full read (only when shown data changed):
      │         ├─ readOmo  (boulder.json + works parse)
      │         ├─ readDbSnapshot (session graph + tools + files)
      │         └─ enrichDelegates + readOmoConfig
```

The cache is keyed by the *visible* data set — current session, its parts,
its children, and any non-archived main session — plus the file fingerprint
(db mtime, omo/oes/gitignore stamps). A no-op event (same part re-reported,
redundant `session.status`) hits the cache; a real change (new tool part,
child update, boulder edit) misses and re-reads. Under WAL the file mtime can
lag, which is why the graph stamp adds the SQL-level checks — the poll and
watch cover the rest.

## Summary

| Clock | Frequency | What updates | Cost |
|---|---|---|---|
| `glyphFrame` (spinner + direction flow) | every 80ms (`GLYPH_TICK_MS`) | glyph text leaves only | ~ms per frame |
| `frame` (glyph2 blink) | every 300ms tick | glyph blink colour leaf | folded into the tick |
| `now` (ages/marks) | 1×/s (`NOW_MS`) | row arrays, ages, marks | folded into the 1×/s tick |
| scan (DB re-read) | on real change only + refresh hints | full snapshot (`pware.oes.snapshot`) | HIT ~5-20ms, MISS ~30-150ms+ |
| fps read | every 6th tick | `self` line fps | negligible |

The `self` line shows the real cost: `0.2ms/ev · 1.2ms/sc · 59fps` instead
of `0.2ms/ev · 353.4ms/sc · 285.3ms/tk · 3fps`. With the 80ms glyph tick the
renderer now runs ~12 frames/s of glyph-only work, so the measured fps reads
closer to that figure — each frame stays cheap because rows are untouched.
