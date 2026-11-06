# ParkNGo: Research & Clarification Questions

> Status: **MVP implemented** (2026-11-06). §0 records the decisions. §1–§9 are the original research.

---

## 0. Decisions (answers received 2026-11-06)

| Topic | Decision | Effect on the implementation |
|---|---|---|
| Commercial vs personal | Personal POC / MVP | Transitous (non-commercial use) is allowed |
| Budget | ₪0 | Transitous + OpenStreetMap only. No Google, so **no live traffic** |
| Bicycle / scooter | Either way | MVP: ride to the station and lock it (OSM `bicycle_parking`) |
| Return trip | Only when the user asks | "Plan the trip back" checkbox + return time |
| Navigation | In-app turn-by-turn preferred | Built in (GPS follow, banner, voice, re-route). Waze / Google Maps links as a fallback |
| Parking types + live status | Yes | All OSM lots near stations + curated list. **Live status not yet done** (see below) |
| User-reported spots | Through GitHub Issues | Issue form `.github/ISSUE_TEMPLATE/parking-spot.yml` → `data/curated-parking.json` |
| Scope / languages / framework | Gush Dan incl. Tel Aviv; Hebrew + English; my choice | React + TypeScript + Vite + Leaflet; RTL support |

Changes from the research proposal, found while implementing:

- **Geocoding uses Transitous** (`/api/v1/geocode`), not Nominatim or Photon. It supports Hebrew, allows autocomplete, and needs one fewer service.
- **Car leg times use Transitous `one-to-many`.** One request returns street times to all shortlisted spots.
- **Transitous street steps carry no turn directions:** every step is `CONTINUE`. Turns are derived from the step geometry (`src/lib/maneuvers.ts`).
- **Storage uses `localStorage`** instead of IndexedDB. The data is tiny (settings, parked location), so it is simpler.
- **The parking data is built at deploy time** by the GitHub Action, not committed. If Overpass fails, the deploy fails, and the previous version stays online.
- **Park-and-ride lots are collected from OpenStreetMap** (`park_ride=*`, `parking=park_and_ride`, or a "חנה וסע" / "Park & Ride" name).
  They skip the "near a rail station" rule, because many are served by shuttle buses (e.g. Shapirim). The planner always
  fully routes the 2 best of them, in addition to the top 5 lots. The deploy log prints every lot found.
- ~~**Live lot status (Ahuzot HaHof)** is not implemented.~~ Superseded below. Those lots are mostly *inside* Tel Aviv, which is the default avoid zone, so they rarely matter to this app. The Tel Aviv GIS host was also unreachable from the development sandbox. This is a candidate for the next iteration.

- **Live lot status (implemented, 2026-11-06):** the Tel Aviv GIS layer 970 is free, needs no key, and allows CORS from any origin.
  - `status_chenyon` values: פנוי available, מעט few, מלא full, סגור closed, פעיל open without a count, or blank. An unknown value fails fast.
  - The `tr_status_chenyon` timestamps are Israel wall-clock time stored as UTC, so they are converted.
  - The planner skips lots that are full or closed. If the service fails, planning continues and the UI shows a warning. This is the one deliberate exception to fail-fast: the status is optional extra data and is never silently dropped.
- **Carry-on bicycle / scooter (implemented):** one Transitous request with `preTransitModes=BIKE&postTransitModes=BIKE`.
  - It does not set `requireBikeTransport`: the Israeli GTFS marks most trips `bikesAllowed=false`, and a folded scooter or bike is treated as hand luggage. The UI tells users to check the operator's rules.

---

## 1. The idea in one paragraph

Moovit / Google Maps route **public transport only**; Waze routes **car only**. Nobody serves
the person who *owns* a vehicle but does not want to drive it **into** a congested core
(e.g., Tel Aviv). ParkNGo plans a **combined trip**: drive (or ride a bicycle / e-scooter) from
**A** to a **free or cheap parking spot P** outside the congestion, then continue by **public
transport** (and walking) from **P** to **B**. It runs as a **PWA hosted on GitHub Pages**.

The core question the app answers is: **"Where should I leave my vehicle?"**

---

## 2. Key constraint: GitHub Pages = static hosting only

GitHub Pages serves static files. That means:

| Consequence | Impact on design |
|---|---|
| No backend server | All routing logic runs **in the browser** or calls **public third-party APIs** directly. |
| No secrets | Any API key in the code is **public**. Only keys that can be restricted by HTTP referrer are usable (e.g., Google Maps keys). |
| No shared database | User-reported parking spots cannot be shared between users unless we add an external service (see Q-D5). |
| Data updates | A **GitHub Actions** cron job can rebuild the static parking dataset (JSON) and redeploy. This acts as our "backend". |

---

## 3. Routing APIs: options researched

### 3.1 Transitous (MOTIS 2 engine), free, open, **covers Israel** ✅ verified

- Public instance at `https://api.transitous.org`, endpoint `/api/v6/plan` ([OpenAPI spec](https://raw.githubusercontent.com/motis-project/motis/master/openapi.yaml)).
- **Israel is included** ([feeds/il.json](https://raw.githubusercontent.com/public-transport/transitous/main/feeds/il.json)): the Ministry of Transport national GTFS
  (`gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip`, refreshed daily) plus Tel Aviv
  municipal feeds and a GTFS-Realtime source.
- Relevant parameters: `preTransitModes`, `postTransitModes`, `directModes`, `maxPreTransitTime`
  (default 900 s), `arriveBy`, `time`, `transitModes`, `requireBikeTransport`.
- Street modes enum includes `WALK`, `BIKE`, `CAR`, **`CAR_PARKING`** (park-and-ride, *experimental*),
  `RENTAL` (shared scooters/bikes, *experimental*).
- Leg geometry = Google encoded polyline → easy to draw on any map.
- **Limits:** volunteer-run and best-effort. It is meant for free/open-source and non-profit use and can
  cut off consumers. Expensive requests are discouraged. Apps must send a `Referer`/`User-Agent`
  and show attribution ([usage policy](https://transitous.org/api/)).
- **Limitation for us:** `CAR_PARKING` uses parking lots from **OpenStreetMap**, *not our own curated
  free-parking list*, and it does not know prices. So we can't rely on it alone to choose "free/cheap" spots.

### 3.2 Google Maps Platform: Routes API

- Supports `TRANSIT` and `DRIVE` (with live traffic) and returns `transitFare` when available.
- **Transit requests do NOT accept intermediate waypoints** (INVALID_ARGUMENT) ([source](https://developers.google.com/maps/ai/maps-experience-agent-tools/compute-routes)).
  → park-and-ride must be built from **two separate requests** (car A→P, transit P→B).
- Pricing (per-SKU free caps since 2025): **Essentials 10,000 free requests/month**, then ~$5 per 1,000.
  Pro SKUs get 5,000 free. Traffic-aware routing is billed at a higher tier ([pricing categories](https://developers.google.com/maps/billing-and-pricing/pricing-categories), [pricing list](https://developers.google.cn/maps/billing-and-pricing/pricing?hl=en)).
- Needs a billing account. The key is public in a PWA, so it must be **HTTP-referrer restricted** to `*.github.io/ParkNGo/*`.
- ⚠️ Google's Terms generally require Google route results to be shown **on a Google map**. Mixing them with
  an OSM map is likely not allowed. *(Not re-verified this session because developers.google.com was unreachable from the sandbox. To be confirmed.)*
- Main advantage over free options: **live traffic** for the car leg. That matters for "avoid big traffic".

### 3.3 HERE Intermodal Routing API v8

- Has a **native Park & Ride mode** (`vehicle[modes]=car`, `vehicle[enable]=routeHead`, `transit[enable]=routeTail`) ([docs](https://docs.here.com/transit/reference/introduction-for-the-intermodal-routing-api-v8)).
- Freemium, commercial. Israel transit coverage **not verified**. Same "our own parking list" problem as Transitous.

### 3.4 Self-hosted engines (OpenTripPlanner 2 / MOTIS / Valhalla)

- OTP2 has `CAR_PARK` mode, can ingest real-time parking feeds, and has a Park-and-Ride API ([OTP docs](https://docs.opentripplanner.org/en/v2.2.0/RoutingModes/)).
- This is the "right" long-term solution: we can load **our own parking data with prices**.
- **Requires a server** (several GB RAM for Israel). That is incompatible with GitHub-Pages-only. Possible **phase 2**.

### 3.5 Car-only routing (free)

- Transitous `directModes=CAR` (OSRM-based, no live traffic).
- OSRM public demo server: for demos only, not production.
- **None of the free options have live traffic.**

---

## 4. Algorithm research

### 4.1 State of the art

- **RAPTOR** (round-based public transit routing) is the standard for GTFS journey planning.
- **MCR (Multimodal Multi-criteria RAPTOR)** and **ULTRA** extend it with walking/bike/car transfers ([arXiv 1906.04832](https://arxiv.org/pdf/1906.04832)).
- Real park-and-ride engines (OTP, MOTIS, HERE) run a **one-to-many car search** from A to all parking nodes.
  Each parking node then becomes a RAPTOR source, offset by its arrival time.
- Running full RAPTOR **in the browser** for Israel is impractical. The GTFS `stop_times` table is very large,
  and a mobile PWA would have to download and index it.

### 4.2 Recommended algorithm: Candidate Park-and-Ride Search (client-side)

A simple, explainable algorithm. It uses **our own parking data**, so prices are known, and it uses
public APIs for the legs.

```
Input: A, B, departure time, vehicle type, user preferences (max price, max walk, weights)

1. FILTER candidates from our parking dataset (local spatial index, e.g. Flatbush/KDBush):
   - price ≤ user max (free first), vehicle type allowed (car / bike / scooter)
   - outside the user's "avoid zone" polygon (e.g. Tel Aviv core)
   - within walking distance (≤ W m) of a rail / light-rail / frequent-bus stop (precomputed)
   - inside the "detour ellipse": dist(A,P) + dist(P,B) ≤ α · dist(A,B)   (α ≈ 1.3–1.5)
   - open at the expected arrival time (opening_hours)
2. RANK by a cheap heuristic (straight-line ETA) and keep the top K (K ≈ 5–10) to limit API calls.
3. For each candidate P (in parallel):
   a. vehicle leg  A → P   (car: Transitous CAR or Google DRIVE w/ traffic; bike/scooter: BIKE)
   b. transit leg  P → B   departing at (arrival at P + parking/walk buffer), Transitous plan
4. SCORE each itinerary with a generalized cost:
   cost = w_t·total_time + w_$·(parking + fuel + fare) + w_x·transfers + w_w·walk_time
5. PARETO-filter on (time, money, transfers); return the 3 best + a "drive all the way" baseline
   and a "transit all the way" baseline for comparison.
```

- Cost: ~2K API calls per search (K=6 → 12 calls). This is fine for Transitous at low volume. With Google it costs money.
- It is the same idea as the engines' "access node" approach, limited to a small, curated candidate set.
- Phase 2 (if we add a server): replace with OTP2/MOTIS loaded with our parking data.

---

## 5. Parking data sources researched

| Source | Content | Access | Status |
|---|---|---|---|
| **OpenStreetMap (Overpass API)** | `amenity=parking`, `fee=yes/no`, `park_ride=yes/train/bus`, `capacity`, `opening_hours`, `bicycle_parking` | Free, ODbL, no key | ✅ Standard tags verified. Israeli coverage of `fee` tags is **incomplete**. |
| **Tel Aviv municipal GIS** (`gisn.tel-aviv.gov.il` ArcGIS REST) | Ahuzot HaHof lots (pricing, capacity, status), public parking layers | Public, no auth (per a community wrapper) | ⚠️ Layer IDs (970, 556) come from a third-party README. Not verified here (host blocked from sandbox). |
| **Tel Aviv API portal** (`apiportal.tel-aviv.gov.il`) | `CityParkingStations` (Ahuzot HaHof) | Unknown auth | ⚠️ Not verified. |
| **Tel Aviv Open Data** (`opendatasource.tel-aviv.gov.il`) | "Status of Ahuzat HaHof parking lots" dataset | Open | ⚠️ Not verified. |
| **data.gov.il – parkinglots** (Survey of Israel) | National parking-lot layer: CSV/XLSX/GeoJSON | Open | ⚠️ Fields (fee? capacity?) not verified. |
| **Park-and-ride lots (חנה וסע)** | Shapirim, HaNetiv, Shefayim (planned, 7,000 cars), station lots | No national dataset found | Must be **curated manually** + OSM `park_ride`. |
| **Israel Railways station lots** | Often free/cheap for passengers | No API found | Terms changed over time. Needs manual curation. |
| **Street parking (blue-white)** | Tel Aviv: free for residents with a sticker. Visitors pay daytime; enforcement rules change. | Rules only, not spot-level | Probably out of scope for v1 (see Q-P4). |

**Real-time availability:** only Ahuzot HaHof lots publish a status (full/available). Even that may not be
truly real-time.

---

## 6. Data storage proposal

```
GitHub repo
 ├─ data/sources/*.yml            ← manually curated spots (park-and-ride, station lots)
 ├─ scripts/build-parking.ts      ← GitHub Action (daily cron):
 │                                  fetch OSM Overpass + Tel Aviv GIS + data.gov.il
 │                                  → normalize → dedupe → precompute nearest transit stops
 └─ public/data/parking.json      ← static output, served by GitHub Pages, cached by the service worker

Browser
 ├─ Spatial index (Flatbush) built from parking.json at load
 ├─ IndexedDB: user preferences, vehicles, saved places, favourite spots, recent trips
 └─ Service-worker cache: app shell, parking.json, map tiles (limited)
```

Proposed **ParkingSpot** schema:

```json
{
  "id": "osm:way/123456",
  "name": "Shapirim Park & Ride",
  "location": { "lat": 32.0, "lng": 34.8 },
  "source": "osm | tlv-gis | govil | curated",
  "vehicleTypes": ["car", "bicycle", "scooter"],
  "price": { "type": "free | flat | hourly | daily", "amountIls": 0, "notes": "free with Rav-Kav validation" },
  "capacity": 1200,
  "openingHours": "24/7",
  "isParkAndRide": true,
  "nearbyStops": [{ "stopId": "…", "name": "…", "mode": "rail", "walkMeters": 250 }],
  "realtimeStatusUrl": null,
  "lastVerified": "2026-11-01"
}
```

GTFS is **not** stored client-side. Transitous does the transit routing. Only stop locations are
used at build time to compute `nearbyStops`.

---

## 7. Proposed tech stack (to confirm)

| Layer | Proposal | Why |
|---|---|---|
| Framework | **Vite + TypeScript** (+ React or vanilla, see Q-T1) | Fast, simple static build |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest + service worker. Map assets need explicit `globPatterns`. |
| Map | **MapLibre GL** or **Leaflet** + OSM-based tiles (e.g., OpenFreeMap) | Free. If Google APIs are used → must be Google Maps JS instead. |
| Routing | Transitous (transit + car/bike legs). Optional Google for traffic. | See §3 |
| Geocoding (address search) | Nominatim/Photon (free, rate-limited) or Google Places | See Q-T4 |
| Storage | IndexedDB (`idb`) | Offline prefs/history |
| Deploy | GitHub Actions → GitHub Pages (`base: '/ParkNGo/'`) | Required by brief |

---

## 8. Clarification questions

Each question shows my **suggested default** in brackets. You can just reply "default" to accept it.

### A. Users & scope
- **Q-A1** Who is the primary user: commuters (daily, same route), occasional visitors to Tel Aviv, or both? *[both, optimize for commuters]*
- **Q-A2** Geographic scope for v1: Tel Aviv only, Gush Dan, or all of Israel? *[Gush Dan → all Israel later]*
- **Q-A3** Which "congested zones" should be avoided? Fixed list (Tel Aviv, Jerusalem, Haifa…), a user-drawn polygon, or automatic based on traffic? *[fixed list + user can toggle]*
- **Q-A4** Is "avoid traffic" about **time** (sitting in jams), **parking cost/difficulty** at the destination, or both? This decides whether we need live-traffic data. *[both]*
- **Q-A5** UI languages: Hebrew (RTL), English, others? *[Hebrew + English]*
- **Q-A6** Is this a personal/portfolio project, or do you plan to commercialize it? This decides which free APIs (e.g., Transitous) are allowed. *[non-commercial]*

### B. Vehicles ("driving options")
- **Q-B1** Can a user own **several** vehicles and pick one per trip? *[yes]*
- **Q-B2** **Bicycle / e-scooter**: is the flow "ride to a station, lock it, take transit" or "take it **on board** the train/bus"? (Israel Railways and bus rules for bikes/scooters differ. They must be encoded per mode and time of day.) *[lock at station; on-board as a later option]*
- **Q-B3** Should we also suggest **ride the bike/scooter at the end** (P→B by micromobility), or shared scooters (Bird/Lime-type) for the last mile? *[not in v1]*
- **Q-B4** Car specifics: fuel cost per km (for cost comparison)? Electric cars → prefer lots with chargers? Disabled-parking permit? *[fuel cost yes, rest later]*
- **Q-B5** Is a "kiss & ride" mode (someone drops you off, no parking) in scope? *[no]*

### C. Trip planning logic
- **Q-C1** Should the app **always** suggest park-and-ride, or compare it with "drive all the way" and "transit all the way" and let the user decide? *[always show both baselines]*
- **Q-C2** What does the user optimize: fastest, cheapest, fewest transfers, least walking? A single slider, or multiple results? *[3 results: fastest / cheapest / balanced]*
- **Q-C3** Max walking distance from the parking spot to the station? *[800 m, user-adjustable]*
- **Q-C4** Max price the user accepts ("low price" = how much? per hour / per day)? *[user setting, default ≤ ₪20/day]*
- **Q-C5** Departure-time planning ("leave now") only, or also "arrive by 09:00" and future dates? *[both]*
- **Q-C6** Round trips: should the app check that the **return** transit trip exists (e.g., last train) and that the lot is still open when the user comes back? This is critical for parking. *[yes, ask return time]*
- **Q-C7** Should the app account for Shabbat/holidays (no public transport → park-and-ride impossible)? *[yes, warn]*
- **Q-C8** Multi-stop trips (A→B→C)? *[no]*

### D. Parking data
- **Q-D1** Do you already have a list of free/cheap parking spots, or must the app build it entirely from public sources? *[public sources + manual curation]*
- **Q-D2** Which parking types count: official park-and-ride lots, train-station lots, municipal lots (Ahuzot HaHof), private lots, free street parking? *[first three in v1]*
- **Q-D3** Is **real-time availability** (is the lot full?) required in v1, or is static data acceptable? *[static + show Ahuzot HaHof status where available]*
- **Q-D4** Can users **add/report** spots ("this lot is free / full / closed")? *[yes, later]*
- **Q-D5** If yes, can we add a free external backend (Supabase/Firebase) for shared user data? Or should reports go through GitHub Issues + manual review, which stays pure GitHub Pages? *[GitHub Issues form in v1]*
- **Q-D6** How should price conditions be modelled, e.g., "free with Rav-Kav validation", "free first 12 h", "free after 17:00"? *[structured rules + free-text note]*
- **Q-D7** Should the app link to payment apps (Pango / Cellopark) or only show info? *[link only]*

### E. Navigation & UX
- **Q-E1** Should the app **navigate** turn-by-turn, or hand off to Waze/Google Maps for the car leg and Moovit for the transit leg (deep links)? *[hand off via deep links: much simpler, no GPS tracking needed]*
- **Q-E2** Remember where I parked (save location + photo + reminder)? *[yes, simple]*
- **Q-E3** Main screen: map-first (like Waze) or form-first (like Moovit)? *[form + map preview]*
- **Q-E4** Saved places (Home, Work) and favourite parking spots? *[yes]*
- **Q-E5** Notifications (e.g., "leave now to catch the train", "lot is full")? *[no in v1, PWA push on iOS is limited]*
- **Q-E6** Must it work **offline** (beyond showing saved trips and parking)? Routing needs network. *[saved data offline only]*

### F. Accounts, privacy, money
- **Q-F1** User accounts / login, or fully anonymous with data stored only on the device? *[anonymous, device-only]*
- **Q-F2** Budget for APIs: is ₪0/month mandatory, or can you set up a Google Cloud billing account (free caps then pay-per-use)? *[₪0 → Transitous + OSM]*
- **Q-F3** If we use Google, are you OK that the map must also be Google Maps (Terms of Service)? *[n/a if ₪0]*
- **Q-F4** Analytics / crash reporting? *[none]*

### T. Technical
- **Q-T1** Framework preference: React, Vue, Svelte, or vanilla TypeScript? *[React + TS]*
- **Q-T2** Repository/URL: deploy to `https://amitaimyers.github.io/parkngo/`, or do you have a custom domain? *[github.io]*
- **Q-T3** Testing expectations: unit tests (Vitest) for the algorithm + an end-to-end smoke test (Playwright)? *[yes]*
- **Q-T4** Address search: free Nominatim/Photon (weaker for Hebrew addresses) or Google Places (better, costs)? *[Photon first]*
- **Q-T5** Do you have documents (SRS / SDD / mock-ups) the implementation must follow? If not, should I write an SRS from your answers first? *[I write a short SRS first]*
- **Q-T6** Is a phase-2 server (self-hosted OTP2/MOTIS with our parking data) acceptable in the future, or must the app stay GitHub-Pages-only forever?

---

## 9. Sources

- MOTIS OpenAPI spec: https://raw.githubusercontent.com/motis-project/motis/master/openapi.yaml
- Transitous Israel feeds: https://raw.githubusercontent.com/public-transport/transitous/main/feeds/il.json
- Transitous API usage policy: https://transitous.org/api/
- Israel MOT GTFS (Mobility Database): https://mobilitydatabase.org/feeds/gtfs/mdb-2519
- Israel GTFS developer docs (Hebrew): https://www.gov.il/he/departments/general/gtfs_general_transit_feed_specifications
- Google Routes overview: https://developers.google.com/maps/documentation/routes/overview
- Google transit waypoint limitation: https://developers.google.com/maps/ai/maps-experience-agent-tools/compute-routes
- Google pricing categories: https://developers.google.com/maps/billing-and-pricing/pricing-categories
- Google pricing list: https://developers.google.cn/maps/billing-and-pricing/pricing?hl=en
- HERE Intermodal Routing (Park & Ride): https://docs.here.com/transit/reference/introduction-for-the-intermodal-routing-api-v8
- OTP routing modes (CAR_PARK): https://docs.opentripplanner.org/en/v2.2.0/RoutingModes/
- OTP vehicle parking sandbox: https://docs.opentripplanner.org/en/v2.2.0/sandbox/VehicleParking/
- ULTRA / multimodal RAPTOR: https://arxiv.org/pdf/1906.04832
- OSM amenity=parking: https://wiki.openstreetmap.org/Tag:amenity=parking
- Tel Aviv Open Data: https://opendatasource.tel-aviv.gov.il/en
- Tel Aviv API portal: https://apiportal.tel-aviv.gov.il/docs/services
- Tel Aviv city MCP (ArcGIS layer list): https://www.pkgstats.com/pkg:@skills-il/tel-aviv-city-mcp
- data.gov.il parking lots (mirror): https://rishonlezion.datacity.org.il/dataset/parkinglots
- Tel Aviv parking regulations: https://www.tel-aviv.gov.il/en/Live/Transportation/Pages/Parkingregulations.aspx
- Shefayim park & ride: https://en.globes.co.il/en/article-park-and-ride-lot-north-of-tel-aviv-approved-1001195682
- vite-plugin-pwa: https://github.com/vite-pwa/vite-plugin-pwa
