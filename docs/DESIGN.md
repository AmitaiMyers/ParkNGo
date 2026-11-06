# ParkNGo — Design System & Front-End Architecture (Phase 1)

> Status: **implemented (Phase 2, 2026-11-06)**. All four recommended options were approved:
> MapLibre + OpenFreeMap, auto-plan, system dark mode + dark at night during navigation, self-hosted Rubik.
> §6 lists what the implementation changed or left out.
> Scope: the UX/UI layer only. Routing, planning and data logic (`src/lib/*`) stay as they are, with one
> addition: progress events from the planner (§4.4).

**Product in one line:** *"Where should I leave my car?"* ParkNGo plans **drive (or ride) → free parking outside the
traffic → public transport**. People use it twice: at home (planning, calm, curious) and **in the car**
(glanceable, one-handed, zero tolerance for friction).

---

## 0. Audit of the current MVP UI

| # | Problem today | Effect | Fix in this design |
|---|---|---|---|
| 1 | Form-first page; results appear *below* the form | On a phone the user must scroll to see anything | **Map-first layout + bottom sheet** (§3.2) |
| 2 | A "Find" button must be pressed after every change | Extra step; stale results after edits | **Auto-plan** when a destination is chosen and when any option changes (§3.1) |
| 3 | Planning takes 3–8 s with only "Planning…" on the button | Feels frozen | **Staged progress + skeleton cards** (§2.3) |
| 4 | "My location" shows as both the field value *and* the button | Visual noise | Origin defaults to *My location* as a chip; the field appears only when changed |
| 5 | No swap button, recent places or saved Home/Work | Retyping for the most common trips | Swap, recents and pinned places in the search panel |
| 6 | Suggestions list is plain buttons | Screen readers don't announce it as an autocomplete | WAI-ARIA **combobox** pattern (§3.4) |
| 7 | The map is decoration (raster tiles, fixed height) | Looks dated, no dark mode | **MapLibre vector map**, light/dark styles, animated route (§4.2) |
| 8 | Leg colors carry meaning alone (walk / rail / bus) | Fails WCAG 1.4.1 (use of color) | Every leg has **icon + label + line pattern** |
| 9 | Navigation banner text at body size | Hard to read at a glance while driving | Driving typography: 40 px distance, 22 px instruction (§1.2) |
| 10 | No visible focus style, no reduced-motion handling | Keyboard and vestibular accessibility gaps | Focus ring token; all motion respects `prefers-reduced-motion` |

---

## 1. Aesthetic & layout

### 1.1 Design language: **"Calm transit"**
Quiet surfaces, one confident brand color, and color reserved for meaning: route modes, live status, call to action.
The map is the canvas, and UI floats over it on soft, rounded surfaces. Shapes are friendly (12–24 px radii) but the
information is dense and precise: tabular numbers, aligned times. Light by default; **dark at night and during
night navigation**, so a bright screen doesn't dazzle the driver.

### 1.2 Color tokens
All text/background pairs below were **measured** against WCAG 2.2 (ratio shown). AA needs 4.5:1 for text and 3:1 for UI
boundaries and large text.

| Token | Light | Dark | Role | Contrast check |
|---|---|---|---|---|
| `--color-bg` | `#F5F7F8` | `#0A1015` | App background | text 16.4 / 16.3 |
| `--color-surface` | `#FFFFFF` | `#111A21` | Cards, sheet | text 17.7 / 15.0 |
| `--color-surface-2` | `#EEF2F4` | `#18242D` | Inputs, inset areas | muted text 6.2 / 6.9 |
| `--color-text` | `#0E1A22` | `#E7EEF2` | Primary text | — |
| `--color-text-muted` | `#4B5B67` | `#9DAEBB` | Secondary text | on surface 7.0 / 7.7 |
| `--color-border` | `#D5DDE2` | `#26343E` | Dividers (decorative only) | — |
| `--color-border-control` | `#7D8B95` | `#62737F` | Input / control outlines | 3.5 / 3.6 ✓ (1.4.11) |
| `--color-primary` | `#0B6E66` | `#3FD3C1` | Brand, main actions, vehicle leg | white on it 6.1 / dark on it 9.1 |
| `--color-primary-hover` | `#095A54` | `#62E0D1` | Hover / pressed | 8.1 |
| `--color-on-primary` | `#FFFFFF` | `#03211D` | Text on primary | — |
| `--color-primary-subtle` | `#D7F3EE` | `#0E3A36` | Selected card, chips | its text 8.5 / 9.5 |
| `--color-accent` (parking amber) | `#F5B700` | `#FFC933` | "P" markers, *Cheapest* badge | text `#2A1E00` on it 9.1 / 10.6 |
| `--color-secondary` (indigo) | `#3B3FC4` | `#A5A8FF` | *Fastest* badge, info links | 7.8 / 8.1 |
| `--color-success` | `#157A3F` | `#4ADE80` | Live: available, saved | 5.4 / 10.1 |
| `--color-warning` | `#9A5B00` | `#FBBF24` | Live: few spaces, notices | 5.4 / 10.5 |
| `--color-danger` | `#B4232A` | `#FF7A7F` | Live: full, errors | 6.5 / 7.0 |
| `--color-focus` | `#0B6E66` | `#3FD3C1` | 3 px focus ring (+2 px offset) | 5.7 / 10.3 |

**Route mode colors** (map lines and leg chips; always paired with an icon and a label):

| Mode | Light | Dark | Line style | Icon |
|---|---|---|---|---|
| Drive / ride (your vehicle) | `#0B6E66` | `#3FD3C1` | solid 6 px, casing | car / bike / scooter |
| Walk | `#6B7A86` | `#8C9BA6` | dotted 4 px | footprints |
| Train (rail) | `#2563EB` | `#6EA2FF` | solid 5 px | train |
| Light rail / metro | `#B0249E` | `#F07AE0` | solid 5 px | tram |
| Bus | `#15803D` | `#4ADE80` | solid 5 px | bus |

**Parking markers:** amber fill with a dark outline (`#2A1E00`, 16:1 on white). Amber alone is only 1.8:1 on a light map,
so the outline is what makes the marker visible.

### 1.3 Typography
- **Typeface: Rubik (variable)**. One family designed for both Hebrew and Latin, with a friendly rounded geometry and
  matched metrics, so Hebrew and English UI look like one system. It is **self-hosted** (`@fontsource-variable/rubik`): it
  works offline in the PWA and makes no third-party request. Fallback: `system-ui, "Segoe UI", Arial, sans-serif`.
- **Numbers**: `font-variant-numeric: tabular-nums` on every time, duration, distance and price, so columns don't jitter
  while values update.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `--text-display` | 28 / 34 | 650 | Trip duration on the selected card |
| `--text-title` | 22 / 28 | 600 | Screen and sheet titles |
| `--text-heading` | 18 / 24 | 600 | Card titles (parking name) |
| `--text-body` | 16 / 24 | 400 | Default |
| `--text-body-strong` | 16 / 24 | 500 | Emphasis inside text |
| `--text-label` | 14 / 20 | 500 | Buttons, chips, field labels |
| `--text-caption` | 12 / 16 | 500 | Metadata, attribution, timestamps |
| `--text-nav-distance` | 40 / 44 | 700 | Navigation: distance to the next turn |
| `--text-nav-instruction` | 22 / 28 | 600 | Navigation: the instruction |

Sizes are in `rem`, so the user's text-size setting scales the whole UI (tested to 200%).

### 1.4 Spacing, shape, elevation
- **4-pt grid:** `--space-1 … --space-8` = 4, 8, 12, 16, 20, 24, 32, 48 px. Gutter 16 px on phones, 24 px on desktop.
  Inside a card the spacing is 12; between cards it is 12; between sections it is 24.
- **Radius:** `--radius-sm` 8 (inputs, chips), `--radius-md` 12 (buttons), `--radius-lg` 16 (cards), `--radius-xl` 24
  (sheet top corners), `--radius-pill`.
- **Elevation (light / dark):** `--shadow-1` cards (subtle, y=1); `--shadow-2` sheet and floating search (y=8, blur 24);
  `--shadow-3` toasts and the floating action button. Dark mode uses lighter surfaces instead of heavier shadows.
- **Touch targets:** at least **48 × 48 px** (above the 24 px WCAG 2.2 minimum). In navigation, primary buttons are 56 px high.
- **Direction:** only logical CSS properties (`margin-inline-start`, `inset-inline-end` …), so the whole UI mirrors
  correctly in Hebrew. Direction icons (turn arrows) are *not* mirrored, because they describe the real world.

### 1.5 Layout
- **Phone (< 900 px):** full-screen map. A **floating search card** sits at the top. A **bottom sheet** has three snap
  points: *peek* (128 px: summary of the best option), *half* (55%: all options), *full* (92%: details and steps).
- **Tablet / desktop (≥ 900 px):** a fixed 400 px **side panel** on the inline-start side with the same content as the
  sheet, and the map fills the rest.
- **Navigation:** a maneuver banner at the top (safe-area aware), map in the middle, and a compact action bar at the bottom
  (*I parked*, *Waze*, *⋯*).

---

## 2. Interactivity & feedback

### 2.1 Motion tokens
| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | Press, hover, toggles |
| `--motion-base` | 200 ms | State changes, chips, card expand |
| `--motion-slow` | 320 ms | Sheet snaps, screen transitions, map fly-to |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Most transitions |
| `--ease-emphasized` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Things entering (sheet, toasts) |
| `--ease-exit` | `cubic-bezier(0.3, 0, 1, 1)` | Things leaving |

Under **`prefers-reduced-motion: reduce`**, all durations become 0–1 ms, nothing is animated along a path, and pulsing
stops. Information is never conveyed by motion alone.

### 2.2 Component states (every interactive component)
| State | Visual treatment |
|---|---|
| Rest | Token colors; controls have `--color-border-control` outlines |
| Hover (pointer only, `@media (hover:hover)`) | Background darkens one step (`primary-hover` / surface-2); 120 ms |
| Pressed | `transform: scale(0.97)` + darker tone; 120 ms; springs back on release |
| Focus-visible | 3 px `--color-focus` ring with a 2 px offset; never removed, only shown for keyboard |
| Selected | `primary-subtle` background, 2 px primary outline, check icon (never color alone) |
| Disabled | 40% opacity, `cursor: not-allowed`, `aria-disabled`, stays focusable when it has a tooltip explaining why |
| Loading | Spinner replaces the icon, the label stays; the button keeps its width (no layout jump); `aria-busy="true"` |
| Success | Check icon morph + optional haptic `navigator.vibrate(15)`; toast for persistent results |
| Error | Inline message under the field/card with icon and a **Retry** action; `role="alert"`; the field gets `aria-invalid` |

### 2.3 Signature micro-interactions
1. **Search → instant plan.** Choosing a destination collapses the search card into a compact "A → B" pill (200 ms)
   and opens the sheet to *peek*.
2. **Staged planning progress** (replaces the static "Planning…"). The planner reports real stages:
   *Finding parking near stations* → *Checking live availability* → *Routing 7 lots* → *Comparing options*.
   - The sheet shows a 4-step progress line plus **3 skeleton cards** with a shimmer (shimmer off under reduced motion).
   - Each stage is announced politely to screen readers.
3. **Results arrive.** Cards fade and rise in a stagger (8 px, 40 ms apart), with the recommended card first. The map flies
   to fit the route (320 ms), and the route **draws itself** from A to B (600 ms line-dash animation, once).
4. **Selecting a card.** The card expands to show its legs timeline. The map cross-fades to that route, and the other
   routes stay as faint 30%-opacity lines for comparison.
5. **Vehicle segmented control.** A sliding pill indicator moves between Car / Bicycle / Scooter (200 ms). Changing it
   re-plans automatically, and old results dim to 50% with a thin progress bar instead of disappearing.
6. **Swap A ⇄ B.** The icon rotates 180° (200 ms) and the two fields cross-slide.
7. **Live status dot.** A "spaces available" dot pulses softly every 2 s for 3 cycles after load, then stays still so it
   doesn't distract. "Few spaces" shows an amber dot, and "full" a red ✕. The "updated 3 min ago" text refreshes every minute.
8. **Bottom sheet.** Drag with momentum and snap to the nearest point using `--ease-emphasized`. The handle has keyboard
   support (↑/↓ change snap point) and `aria-valuetext` ("Options panel, half open").
9. **Navigation maneuver change.** The banner content slides up (old out, new in, 200 ms) and the distance counts down in
   tabular numbers. Within 100 m the banner turns to `primary` with a gentle scale-in of the arrow.
10. **"I parked."** The button morphs into a check, a "Parking saved" toast appears with **Undo** (5 s), there's a short
    vibration, then the screen transitions to the transit steps.
11. **Transit countdown.** "Bus 567 leaves in 4 min" updates live, and turns amber under 2 minutes with the text
    "Hurry: 2 min".
12. **Offline / service errors.** A slim banner appears under the header ("Offline: showing saved parking only"), and
    planning is disabled with the reason given in the button's tooltip.

---

## 3. Usability: the zero-friction journey

### 3.1 Primary journey (target: **2 taps + typing**)
```
Open app ──► Map centered on you · search card: "Where to?" (origin = My location, implicit)
   │            ├─ recent destinations and Home / Work shown as one-tap chips
   ▼
Type 3 letters ─► suggestions (recent first, then search) ─► tap a destination
   ▼
Auto-plan (defaults: default vehicle, leave now) ─► staged progress ─► sheet at PEEK:
   "Park at Reading West · Free · 41 min · arrive 08:42"  [Start ▶]
   │   swipe up ─► all options: Recommended / Fastest / Cheapest + compare (drive all the way, transit only)
   │   option chips above the results: [🚗 Car ▾] [Now ▾] [↩ Return trip] — each change re-plans in place
   ▼
Start ─► Turn-by-turn to the parking (voice optional) ─► "I parked" ─► transit steps with live countdown
   ▼
Arrive. Later, the home screen shows: "🅿 Your car is at Reading West · Get me back" (one tap plans the reverse trip)
```

### 3.2 Information hierarchy (on every option card)
1. **The decision:** parking name + price badge (*Free* / *₪ 15/day* / *Price unknown*).
2. **The outcome:** total time (display size) + arrival time.
3. **The trade-offs:** walk minutes, transfers, live availability.
4. **The path:** a compact **leg strip** (🚗 18 › 🚶 4 › 🚆 14 › 🚶 5) whose segment widths are proportional to time.
5. **The action:** *Start* (primary) and *Details* (secondary).

### 3.3 Cognitive-load rules
- **One primary action per screen** (*Start*, *I parked*, *Done*).
- **Progressive disclosure:** advanced settings (fuel cost, value of time, avoid zones) live in Settings. Only vehicle,
  time and return trip are on the main surface.
- **Smart defaults:** leave now, origin = my location, default vehicle, avoid Tel Aviv. Price policy defaults to "allow
  up to ₪20", but free lots rank first.
- **Plain-language explanations:** a "Why this?" line on the recommended card ("Free, 4 min walk to Tel Aviv University
  station, 12 min faster than public transport").
- **Honest uncertainty:** "Price unknown" and "no live data" are shown as such, never hidden.
- **Empty and error states teach:** for no options, show the reason (e.g. Shabbat) and offer one-tap fixes (*Allow paid
  parking*, *Walk up to 1.2 km*, *Leave Saturday 19:00*).

### 3.4 Accessibility (WCAG 2.2 AA)
- **Contrast:** all tokens measured (§1.2). Non-text UI ≥ 3:1. Map lines ≥ 3:1 against their map style.
- **Not color alone:** every mode, status and badge has an icon + text. Live status uses ● / ◐ / ✕ shapes.
- **Landmarks and semantics:** `header`, `main`, `nav`, `region` for the sheet with `aria-label`; one `h1` per screen.
- **Search = WAI-ARIA combobox:** `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, and
  a `listbox` of `option`s. Arrow keys, Enter and Esc work, and the number of suggestions is announced.
- **Segmented controls = `radiogroup`.** The sheet handle is a `slider`-like button with keyboard snap control.
- **Live regions:** planning stages and result counts use `aria-live="polite"`. Navigation instructions use a dedicated
  polite region (voice guidance covers urgency). Errors use `role="alert"`.
- **The map is supplementary:** everything on the map also exists in the list. The map container is labelled, and markers
  are mirrored as list items. Keyboard users never need the map.
- **Focus management:** when the sheet opens, focus moves to its heading; when it closes, focus returns to the trigger.
  The navigation screen focuses the maneuver banner.
- **Targets:** ≥ 48 px; ≥ 8 px between adjacent targets. Gestures always have a button alternative (WCAG 2.5.7).
- **Motion:** `prefers-reduced-motion` respected everywhere. Nothing flashes more than 3 times per second.
- **Language and direction:** `lang`/`dir` on `<html>` per setting; mixed-language strings wrapped in `<bdi>`, so Hebrew
  stop names inside English sentences render correctly.
- **Driving safety:** the navigation screen has large text, high contrast, no keyboard input and no secondary content.

---

## 4. Front-end architecture

### 4.1 Principles
- Keep the stack **React 19 + TypeScript + Vite**. **No CSS framework**: design tokens as CSS custom properties plus
  **CSS Modules** per component. This keeps RTL with logical properties and avoids a new dependency.
- **No animation library:** CSS transitions + the Web Animations API, plus small hooks (`useReducedMotion`, `useSheet`).
- The `src/lib/*` domain layer stays pure and tested. UI components never call fetch directly; they use hooks that wrap
  the planner and services.

### 4.2 Proposed dependencies (to approve)
| Package | Why | Cost |
|---|---|---|
| `maplibre-gl` + **OpenFreeMap** styles (`liberty` light / `dark`) | Crisp vector map, real dark mode, smooth fly-to, animated route lines; free, no key | ≈ 210 KB gzip, **lazy-loaded** after first paint. Free service "as-is", so the style URL is a single constant that is easy to swap |
| `@fontsource-variable/rubik` | One Hebrew + Latin typeface, offline | ≈ 60 KB (Hebrew + Latin subsets) |
| `lucide-react` | Consistent, tree-shaken icon set (car, bike, scooter, train, tram, bus, footprints, parking…) | Only the icons used (~1 KB each) |

These replace Leaflet + react-leaflet.

### 4.3 Structure
```
src/
  styles/
    tokens.css          ← every token in §1–2 (light + dark + reduced motion)
    base.css            ← reset, typography, focus ring, RTL rules
  ui/                   ← design-system primitives (no app knowledge)
    Button, IconButton, SegmentedControl, Chip, Badge, Card, Sheet,
    Combobox, Skeleton, Toast, ProgressSteps, LiveDot, Icon
  features/
    search/             ← SearchCard, PlaceCombobox, RecentPlaces
    results/            ← OptionCard, LegStrip, WhyLine, CompareRow, EmptyState
    navigation/         ← ManeuverBanner, TransitSteps, ActionBar
    map/                ← MapCanvas (MapLibre, lazy), route + marker layers
    settings/           ← SettingsSheet
  hooks/
    usePlanFlow.ts      ← reducer state machine (below)
    useGeolocation.ts, useReducedMotion.ts, useSheet.ts, useCountdown.ts
  lib/                  ← unchanged domain layer (planner, transitous, i18n, …)
```

### 4.4 Plan flow as an explicit state machine
```
idle ──selectDestination──► planning(stage) ──success──► results(selected)
  ▲                            │   ▲                         │
  │                            │   └──── changeOption ◄──────┤   (re-plan keeps old results dimmed)
  │                            └──failure──► error(retry)    │
  └────────────── clear ◄──────────────────────── start ──► navigating(phase: vehicle | transit)
```
- `planTrip` gets an optional `onProgress(stage)` callback; the stages are the four in §2.3. This is the only
  domain-layer change.
- A request id guards against races: the results of an outdated plan are discarded when the user changes options mid-plan.

### 4.5 Quality gates for Phase 2
- Unit tests: the reducer, countdown and sheet snapping logic (Vitest); existing tests stay green.
- Playwright: the main journey in **en** and **he** at 390 px and 1280 px, light and dark; keyboard-only run; reduced-motion run.
- Automated accessibility scan (axe-core in Playwright): **0 serious or critical issues**.
- Performance: first paint before the map loads; JS for the first screen ≤ 150 KB gzip (map chunk lazy); Lighthouse PWA,
  accessibility and best practices ≥ 95.

---

## 5. Decisions needed before Phase 2
1. **Map:** switch to MapLibre + OpenFreeMap vector tiles (recommended), or keep Leaflet + raster tiles (smaller, plainer)?
2. **Auto-plan** when a destination is chosen (recommended), or keep an explicit "Find" button?
3. **Dark mode:** follow the system plus automatic dark during night navigation (recommended), or light only?
4. **Font:** Rubik self-hosted (recommended), or system fonts only (0 KB)?

---

## 6. Phase 2 — implementation notes

**Built as specified:** design tokens (`src/styles/tokens.css`) with one dark definition (`.theme-dark`); the CSS
Modules component kit (`src/ui/`); a map-first layout with a three-point bottom sheet on phones and a side panel at
≥ 900 px; auto-planning through the `planFlow` state machine with request-id race protection; staged planning progress
with skeletons; option cards with leg strip, "why" line, live status and Start; empty states with one-tap fixes; the
WAI-ARIA combobox with recents; swap; a parked-car card with "Get me back"; navigation with a turn banner (blue when
close), "Then" hint, ETA, a toast with Undo after "I parked", and transit steps with a live countdown; dark at night
using a computed sunrise/sunset; an offline notice; Hebrew right-to-left everywhere, with `<bdi>` isolation for place
names inside sentences.

**Changed while building:**
| Spec | Implementation | Why |
|---|---|---|
| Map ≈ 210 KB gzip | **292 KB gzip**, lazy chunk + a 519 KB worker | MapLibre 6's real size; first-screen JS is 101 KB gzip (target ≤ 150 KB) |
| Light map style "liberty" | **"positron"** (calm grey) for light, **"dark"** for dark | Route colors stand out better on a quiet base map; fits "Calm transit" |
| Route "draws itself" | Route **fades in** (450 ms) | Per-mode line colors rule out MapLibre's gradient line-draw trick; respects reduced motion |
| Hebrew "קורקינט חשמלי" | **"קורקינט"** | The full label wrapped in the segmented control at 390 px |
| — | Singular forms (`_one` keys) | "1 lots skipped" and "1 transfers" read wrong |

**Added after Phase 2:**
- **Saved Home & Work:** stored on the device and edited in Settings. They appear as one-tap chips ("Add Home & Work" while
  empty) and first in both search fields.
- **Turn-by-turn for every street segment:** navigation is a sequence of segments (`src/lib/segments.ts`: drive/ride →
  transit → ride). A carried bicycle or scooter gets full guidance on its final ride too, and arrival instructions name
  the real end point (parking, boarding stop or destination).
- **Lighthouse** (`npm run lighthouse`, also in CI). Mobile emulation, measured on the production build:

| Category | Score | Note |
|---|---|---|
| Accessibility | **100** | gated ≥ 95 |
| Best Practices | **100** | gated ≥ 95 |
| SEO | **100** | gated ≥ 95 |
| Performance | **70** | reported only. FCP 1.0 s, LCP 2.0 s, CLS 0, TBT ≈ 2.4 s |

  The blocking time is MapLibre drawing vector tiles. The test machine has no GPU, so WebGL runs in software on the CPU.
  With the tile server blocked, the same build scores **99** (TBT 60 ms). Changes made for this: the map mounts when the
  browser is idle after first paint (LCP 4.0 → 2.0 s), the label fade is off, and the pixel ratio is capped at 2.
  Real-device (GPU) performance has not been measured.

**Quality gates (all passing):** 67 unit tests (Vitest), including the state machine, sheet snapping, sunrise/sunset,
the why-line, singular forms and bidi parts; 9 Playwright tests with mocked network (full journey, Hebrew RTL,
keyboard-only, desktop layout without overflow, reduced motion); and axe-core WCAG 2.2 A/AA scans with **0 serious or
critical issues** on home, results, settings and navigation, in light and dark. Every color pair added during the
build was measured too: all ≥ 4.5:1 for text and ≥ 3:1 for UI. CI runs the e2e and accessibility suite before every deploy.

### Trip questions and resilience (after user testing)
- **"Are you OK with…"** on every trip: walking over 1 km (otherwise ≤ 1 km; yes allows up to 2 km), paid parking
  (free still ranks first), and parking in Tel Aviv-Yafo. Defaults come from Settings; each answer re-plans, and the
  empty state's fixes set the same answers.
- **No more "Load failed":**
  - The routing client allows at most 4 requests in flight.
  - It retries dropped or overloaded requests twice.
  - Each lot is routed independently: a failure costs that lot ("1 lot could not be checked"), not the plan.
  - Only a full outage shows an error, as a plain "Couldn't reach the routing service" message.
- **Address search is limited to Israel** (it found French and German streets first before).
- **Night / Shabbat warning** when even the fastest option takes over 3 hours.
