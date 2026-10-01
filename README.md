> **Accounts-to-staging update:** Native sign-in/GPS no longer requires a Mapbox token when web routing is disabled. Follow [ACCOUNTS-TO-STAGING.md](docs/ACCOUNTS-TO-STAGING.md) to create the database/service. No cloud deployment has occurred.

> **Native APK now built:** Rydora Driver 0.2.0 ARM64 test APK is available. It includes local device checks without an account. No API or maps key is configured, and there has been no physical-device runtime test. See [installation, validation and next setup steps](docs/NATIVE-ANDROID-TEST.md). This supersedes older “no APK built” notes below.

> **Native driver milestone:** `apps/driver` is now an Expo 57 / React Native TypeScript driver app with SMS sign-in, SecureStore sessions, free trial, local driver/car photos, native map and opt-in foreground staging GPS. No new APK has been built; rider starter remains unchanged. Read [NATIVE-DRIVER.md](docs/NATIVE-DRIVER.md).

> **Current driver policy: FREE TRIAL.** No driver access fee for now, 0% trip commission and no automatic charges. The older $25 plan below is suspended. See [driver trial notes](docs/DRIVER-TRIAL.md) for the photo/requirements preview and remaining production limitations. Existing APKs are unchanged.

> **Private GPS staging:** Opt-in, approved-driver-to-one-invited-viewer live browser location is now available behind a disabled-by-default staging flag. It is **not** public trip tracking, driver dispatch or part of the old offline APK. See [docs/DRIVER-TRACKING.md](docs/DRIVER-TRACKING.md).

> **Rydora online maps:** Run `npm run dev:maps` (port 5174) and select **Load online map**. Real online street tiles, pins and opt-in GPS work without an API key; address search and road/fare previews require the configured staging providers. See [docs/LIVE-MAPS.md](docs/LIVE-MAPS.md). Previously delivered APKs remain offline.

> **Launch preparation:** A separate restricted staging foundation is now included. Nothing has been deployed; EcoCash, live bookings and online mobile release remain blocked. Start with [docs/GO-LIVE.md](docs/GO-LIVE.md). Do not deploy the offline demo as a live service.

# Latest Android release: 1.2.0
Country-neutral interface update. See [COUNTRY-NEUTRAL.md](docs/COUNTRY-NEUTRAL.md). Install `Ride-Dora-Demo-1.2.0.apk` as an update; the demo remains offline with unchanged pricing.

# Current policy update
The empty-return pricing policy supersedes the earlier engine-rate examples below. See [EMPTY-RETURN.md](docs/EMPTY-RETURN.md) for implemented behavior and remaining routing/database work. Latest APK: **Ride-Dora-Demo-1.1.0.apk**.

# Rydora
Original, Harare-first ride-hailing development MVP. USD is the assumed fare currency. The official product name is **Rydora**. Legacy folder and package identifiers are retained for compatibility.

## Android demo APK
An offline all-roles Android package is available as `releases/Ride-Dora-Demo-1.0.0.apk` (Android 8+ with an up-to-date System WebView). Install instructions, scope, build/signing details and validation limits: [ANDROID-APK.md](docs/ANDROID-APK.md). This is the local web demo in a native wrapper, not the API-connected Expo apps.

## Important status
This is a **working development scaffold and interactive product demo, not a production-ready transportation service**. The web rider/driver/admin views simulate operations locally and are NOT wired to the API. The separate Expo clients do call the shared API. The API stores data in memory; SQL migrations are provided but are NOT integrated into the runtime. Restarting the API erases its state. Production startup is deliberately blocked. No real card, EcoCash, SMS, emergency, dispatch, navigation or background-location service is connected. Do not deploy with real customer data.

## Visible SOS update
A persistent **red SOS · Police 995** button is now at the bottom-right of the web preview, including during trips and over the driver paywall. The shared Expo component adds SOS to rider/driver and login screens. The panel includes 112 (Econet) and 114 (NetOne) as network-specific toll-free alternatives, optional location/details, and an explicit phone-app handoff. No automated police alert is sent. Read [SAFETY.md](docs/SAFETY.md) for official contact sources and unverified routing/charging limitations.

## Distance pricing update
Light cars (up to 1500cc): $0.26–$0.27/km; Medium (1501–2000cc): $0.31–$0.35/km. Defaults use midpoints: **5 km = $1.33 Light / $1.65 Medium**. No base or minimum fare. Negotiation remains available; accepted offers are charged instead of the suggestion. See [pricing model and revised API](docs/PRICING.md).

## Driver access update
**USD $25 for 30 days**, manually renewed, replaces per-trip commission under the revised MVP assumption. The driver preview has an access paywall, renewal window and local receipt ledger; the Expo panel calls authenticated subscription endpoints. The API gates new requests, bidding and assignment, without interrupting an accepted trip. Payment simulation is explicit and admin-only on the API. The live EcoCash adapter is not connected.

See [Driver pass specification, API and tests](docs/DRIVER-PASS.md).

## Repository
```
apps/web/          React + Vite responsive rider, driver & admin product preview
apps/api/          Express + JWT + Socket.IO development API
apps/rider/        Expo rider application entry and native configuration
apps/driver/       Expo driver application entry and native configuration
packages/mobile/   Shared API-connected React Native screens
packages/ui/       UI library location and design token documentation
db/migrations/     Postgres + PostGIS schema and atomic bid acceptance function
tests/             Domain tests and API smoke flow
docs/              API reference, launch checklist and deployment guidance
```

## Run the web and API
Node 20.19+ recommended.
```sh
npm install
cp .env.example .env
# Replace JWT_SECRET with `openssl rand -hex 32` output. Never commit .env.
npm run dev                      # port 5173
# In another terminal:
npm run api                      # port 4000; live billing disabled
```
Open http://localhost:5173. The web role tabs are demo navigation, NOT authorization. The protected API uses signed claims and role checks. Requests to `/api` and Socket.IO are proxied by Vite. The web preview deliberately works without third-party keys.

### Explore the demo
- Select a ride tier and EcoCash/cash/card; no payment is charged.
- Request an upfront ride or name your fare and choose one of three sample drivers.
- Use **Demo: start trip** and **Demo: complete trip** to advance the rider flow.
- Rate the ride and view its local receipt under My trips.
- Apply `DORA1`, try the schedule picker, chat, safety information and dark mode.
- Switch to Driver, choose **Go online**, and activate the explicitly simulated $25 pass to explore requests.
- Open Admin → Subscriptions for the local pass ledger. Browser pass activation never grants API access.
- Trip history and the local demo driver pass/receipts are persisted in browser localStorage. Other web interactions are session-only; mock totals are not accounting records.

## Mobile applications
Each app has its own Expo dependencies and shares source under packages/mobile.
```sh
cd apps/rider # or apps/driver
npm install
npx expo install --check
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:4000/api npx expo start
```
Use a physical device on the same network or an emulator. The API binds 0.0.0.0. Use the machine LAN IP for physical devices, 10.0.2.2 for Android emulator, and HTTPS for external hosts. Configure Google Maps keys in `GOOGLE_MAPS_ANDROID_KEY` and `GOOGLE_MAPS_IOS_KEY` for native builds. Metro configuration watches the shared package source. Run `npx expo run:android` / `run:ios` for a native development build.

The client demonstrates OTP, SecureStore token storage, map markers, a fixed Harare route, requests, bidding, foreground GPS, trip PIN, start/end, chat, history and ratings. Route polyline is straight, not routing directions. Phone OTP appears in an explicit demo response instead of SMS. Rider/driver accounts must use different phone numbers. The DriverPassPanel retrieves live API pass status, creates pending demo checkouts when enabled, and polls status/history. Tokens expire after 15 minutes; refresh API is implemented but automatic mobile renewal/recovery is a remaining task. Native dependency installation and device builds have **not** been validated in this environment.

Driver verification: on a private local API started with DEMO_ADMIN_PHONE, log in using the demo operator phone, submit driver document metadata, and call `/admin/verify-driver`. There is no actual document upload/verification service. The `api-smoke.mjs` flow illustrates these calls.

## Database
```sh
docker compose up -d db
# Or against an existing PostGIS database:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_initial.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_atomic_assignment.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/003_driver_pass.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/004_distance_pricing.sql
```
Compose applies migrations only when creating a fresh volume. The schema includes users, profiles, documents, vehicles, rides, bids, payments, ratings, promotions, SOS, messages, refresh tokens, OTP challenges, support and audit logs. PostGIS index supports nearby queries. Partial unique indexes enforce one active trip per rider/driver. Atomic bid assignment function locks the ride and driver. Migrations 001–004 were applied to a local PostgreSQL 17/PostGIS database and the driver-pass transaction tests passed. They are still not integrated into the running API repository.

## Tests & build
```sh
npm test
npm run build
npm run test:api
npx playwright install --with-deps chromium
npm run test:web
# Against a disposable database with migrations applied:
TEST_DATABASE_URL=postgresql://... npm run test:db
```
Validated: 43 unit tests; isolated API smoke flow including paywall enforcement and admin-only settlement; 14 Playwright tests across desktop and mobile browser layouts; SQL concurrent checkout/settlement, assignment guards, renewal and expiry; mobile JSX parsing; API syntax; web production build. No native device builds or external-provider tests have been executed. The database tests validate migrations, not a persistent API runtime.

See [API reference](docs/API.md) and [Deployment and launch requirements](docs/DEPLOYMENT.md).
