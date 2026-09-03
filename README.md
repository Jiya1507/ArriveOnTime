# ArriveOnTime

Maps tell you how long the journey takes. This tells you when to walk out of the door.

It works backwards from the moment you need to be somewhere — subtracting drive
time, traffic, weather, roadworks, hunting for a parking space, the walk in from
the car park, and however early you personally like to be — and gives you a
single time with a countdown against it.

![Tests](https://img.shields.io/badge/tests-79%20passing-4f7a70)
![Build](https://img.shields.io/badge/build-vite%208-4f7a70)

---

![The decision panel and the backwards timeline](docs/screenshot-hero.png)

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

> **Don't open `index.html` by double-clicking it.** It's a source file that
> loads `/src/main.js` as an ES module, and browsers block modules over
> `file://` — you'll get an unstyled page with no JavaScript. Either run
> `npm run dev`, or run `npm run build` and open `dist/index.html`, which is
> built with relative paths and works straight off disk.

```bash
npm test         # 79 unit, DOM and end-to-end tests
npm run build    # production bundle in dist/
npm run lint     # eslint
npm run format   # prettier
```

`npm run build` produces a `dist/` with relative asset paths, so the built file
also opens straight off disk if you want to hand someone a folder.

---

## The idea

Every commute app answers "how long will it take?". Nobody wakes up wanting
that number. They want to know whether they can finish their coffee.

So the arithmetic runs the other way:

```
10:00   Client meeting starts
 9:45   Seated and settled          -15 min  your buffer
 9:39   Walked in from the car park  -6 min
 9:31   Found a space                -8 min
 9:26   Padding for a shaky forecast -5 min
 9:19   Rain slowing the roads       -7 min
 9:14   Roadworks on the route       -5 min
 8:56   Sitting in traffic          -18 min
 8:14   Pulling out of the drive    -42 min
─────
 8:14   Leave at
```

That ledger is the hero of the interface, drawn as a stack of bands sized by
their minutes. When traffic worsens the band grows, picks up a `+11` badge and
flashes, the timeline stretches, and the departure time rolls from 8:14 to 8:03
in front of you. It's the one piece of motion in the app, and it exists to point
at the thing that moved rather than silently repainting every number on screen.

---

## Architecture

```
src/
├── core/                 pure — no DOM, no globals, no clock of its own
│   ├── commuteEngine.js  the maths
│   ├── schedule.js       meetings, rescheduling, clash detection
│   ├── changes.js        "what changed since last time"
│   ├── copy.js           mode-aware vocabulary
│   └── time.js           formatting and date arithmetic
├── services/             mock traffic / weather / parking providers
├── state/                the store and its localStorage backing
├── ui/                   every DOM write, one module per region
└── main.js               the only file that owns the clock and the listeners
```

### The engine is a function, not a subsystem

```js
const result = calculateCommute({ trip, conditions, preferences, now });
```

Everything arrives as an argument. Nothing is read from module scope, nothing is
mutated, and the result comes back frozen. `main.js` decides what to do with it:

```js
state.result = calculateCommute({
  trip: state.trip,
  conditions: state.conditions,
  preferences: state.preferences,
  now: new Date(),
});
```

Same inputs, same output, no side effects — which is why the test file can check
twenty scenarios without a single mock or a `beforeEach`.

### Two arrival times, deliberately kept apart

The interesting case is when you're already late, because that's exactly when
people open the app.

|                         |                                                        |
| ----------------------- | ------------------------------------------------------ |
| `recommendedArrivalStr` | where you land if you'd left when you were told to     |
| `leaveNowArrivalStr`    | where you land if you walk out of the door this second |

At 8:25, with a recommended departure of 8:14, those are 9:40 and 9:51. Showing
the first as if it were the second — measuring the ETA from an ideal departure
that has already passed — would put the number eleven minutes out at the exact
moment it matters most. The interface shows both, along with the nine minutes of
margin you have left.

### Meetings own their date

```js
{ id: 'm1', title: 'Client meeting', date: '2026-09-01', time: '10:00', mode: 'car', buffer: 15 }
```

There is no "if the time has passed, assume they meant tomorrow" fallback. At
11:05 on the day of a 10:00 meeting, the meeting is missed — the app says so and
offers to reschedule it. A missed meeting and tomorrow's meeting are different
things and the model knows which is which.

### Simulation overrides, it doesn't replace

The demo panel's parking and confidence controls default to _Destination
estimate_ and pass `null`, so the airport keeps its ten minutes and Connaught
Place keeps its twelve. Only a deliberate choice replaces the service's number,
and the breakdown says "Simulated override" when it does.

### Language follows the mode

All component wording comes from `core/copy.js`, keyed by how you're travelling.
Pick transit and nothing mentions the car park — you get station transfers, the
walk from the station entrance, and a destination note about the Rapid Metro.
Pick a bike and you get bike stands. There's a test asserting the transit ledger
never matches `/parking|car park|driv/i`.

---

## Testing

```
tests/engine.test.js     21   the maths, purity, edge cases, the late-ETA bug
tests/schedule.test.js   21   dates, rescheduling, clashes, change detection, services
tests/ui.test.js         23   rendering, contrast, type scale, delta badges
tests/app.test.js        14   boots the whole app in jsdom and drives it
```

The DOM tests read `index.html` from disk rather than a fixture, so a markup
change that breaks a hook fails in CI instead of in front of somebody. The
end-to-end file boots `main.js` itself and clicks through adding a meeting,
rescheduling it, starting a journey and borrowing time from the buffer.

Contrast is asserted, not eyeballed: `ui.test.js` computes WCAG relative
luminance for every text token against every surface and fails below 4.5:1, and
a second test fails the build if any utility class sets text below 12px.

GitHub Actions runs lint, format check, tests and a production build on every
push.

---

## What it looks like

The one screen that matters is the late state, because that's when people open
the app. The alert names the cause and the size of the shift, the bands that
moved pick up badges and flash, and the hero splits the two arrival times apart:

![Traffic worsening: the alert, the delta badges and the two arrival times](docs/screenshot-what-changed.png)

Journey mode replaces the countdown with a live ETA, the margin against the
meeting, and a timer to the next automatic re-check:

![Journey mode](docs/screenshot-journey.png)

Dark mode and 390px are first-class, not afterthoughts:

![Dark mode](docs/screenshot-dark.png)

## Going live

The three files in `src/services/` are the whole integration surface. Each one
returns the shape the app consumes, so swapping in a real provider means
rewriting one file:

| Mock             | Real equivalent                                   |
| ---------------- | ------------------------------------------------- |
| `trafficService` | Google Directions, Mapbox, HERE                   |
| `weatherService` | OpenWeatherMap current conditions                 |
| `parkingService` | Parkopedia, or your own estimates per destination |

Nothing above the service layer knows they're fake.

---

## Built with

Vite, Tailwind CSS v4, Lucide (tree-shaken, pinned), Inter and Bricolage
Grotesque self-hosted via Fontsource, Vitest and jsdom. No CDN script tags and
no floating `@latest` anywhere in the dependency tree.
