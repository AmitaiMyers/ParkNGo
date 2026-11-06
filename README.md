# ParkNGo

**Drive (or ride) to free parking outside the traffic, then continue by public transport.**

Moovit and Google Maps plan public-transport trips. Waze plans car trips. ParkNGo plans the
combination: drive your **car**, **bicycle** or **e-scooter** to a free or cheap parking spot
near a train or light-rail station outside the congested area (e.g. Tel Aviv), and continue
by public transport.

Live app (after Pages is enabled): https://amitaimyers.github.io/ParkNGo/

## Features (MVP, Gush Dan)

- Address search in Hebrew and English. "My location" works as the start point.
- Vehicle per trip: car, bicycle or e-scooter.
- Park & ride search. Settings cover price (free only, or paid up to ₪X/day), max walk from parking to the station, and areas to avoid (Tel Aviv-Yafo by default).
- Three highlighted options (Recommended / Fastest / Cheapest), compared with "drive all the way" and "public transport only".
- Optional **return trip** check: is there public transport back to your vehicle at your return time?
- **Live "lot is full" status** for Tel Aviv municipal (Ahuzot HaHof) lots. Full or closed lots are skipped; the others show a live badge.
- **Bicycle / e-scooter carry-on**: optionally take a folding bike or scooter on board, and ride to the first stop and from the last stop.
- **Turn-by-turn guidance** to the parking spot: GPS follow, turn banner, voice in Hebrew or English, and automatic re-routing. Then step-by-step public-transport instructions.
- Remembers where you parked. Waze and Google Maps hand-off links are offered as a fallback.
- Hebrew (RTL) and English UI. Installable PWA. Settings stay on the device; there are no accounts.
- Users can suggest parking spots through a GitHub issue form.

## How it works

See [docs/RESEARCH.md](docs/RESEARCH.md) for the full research, the algorithm and the decisions.

| Part | Source |
|---|---|
| Transit + street routing, geocoding | [Transitous](https://transitous.org) (MOTIS 2): free, includes the Israeli MOT GTFS feed |
| Parking spots + stations | OpenStreetMap via Overpass (rebuilt on every deploy) + `data/curated-parking.json` |
| Park & ride lots | OpenStreetMap: `park_ride=*`, legacy `parking=park_and_ride`, or a name containing "חנה וסע" / "Park & Ride". These lots are always kept, even far from rail (shuttle-served), and the planner always tries the best ones. Each deploy log lists the lots found. |
| Live lot status + municipal lots | Tel Aviv-Yafo GIS, layer 970 "חניוני אחוזות החוף": free, public, CORS-enabled. Lots are added at build time; status is fetched live when planning |
| Avoid-zone boundaries | OpenStreetMap administrative boundaries via Nominatim |
| Map tiles | OpenStreetMap |

The planner (`src/lib/planner.ts`) works in four steps:

1. Filter parking spots by vehicle, price, walking distance to a station, avoid zones, and a detour ellipse around A→B.
2. Rank the spots by straight-line distance, then refine the top 25 with one batched street-time request.
3. Route the top 5: vehicle A→P plus public transport P→B.
4. Score each trip with a generalized cost: time, plus money converted to minutes, plus penalties for transfers and walking.

## Development

```bash
npm install
npm run build:data   # builds public/data/parking.json (needs internet access to Overpass + Nominatim)
npm run dev          # http://localhost:5173/ParkNGo/
npm test             # unit tests (Vitest)
npm run build        # type-check + production build into dist/
```

Requires Node ≥ 22.18, because the data script is TypeScript run directly by Node.
`public/data/parking.json` is generated, so it is not committed.

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` runs on every push to `main`, weekly (to refresh parking data), and on demand.
It runs the tests, builds the parking data, builds the app and deploys it.

**One-time setup:** in the repository, go to *Settings → Pages → Build and deployment → Source* and select **GitHub Actions**.

## Adding parking spots

Open a [“Suggest a parking spot”](https://github.com/AmitaiMyers/ParkNGo/issues/new?template=parking-spot.yml) issue.
A maintainer adds approved spots to `data/curated-parking.json`. Use the same fields as a `ParkingSpot` in
`src/lib/types.ts` (with `"liveStatus": null`), without `nearestStation`, which is computed at build time.

## Known limitations

- Transitous is a free, best-effort, non-commercial service. It is fine for a personal POC but not for a commercial product.
- Car times have **no live traffic**. They are free-flow estimates.
- OpenStreetMap price data is incomplete: many lots show "price unknown".
- Live occupancy covers only Tel Aviv municipal lots, which are inside Tel Aviv (the default avoid zone). No free live source was found for other lots.
- Public transport does not run on Shabbat and holidays, so park & ride usually finds no option then.
