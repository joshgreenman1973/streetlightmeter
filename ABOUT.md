# StreetLightMeter

**A mobile web app that lets anyone measure street lighting with their phone and report dark spots to NYC 311.**

Built by Vital City as a tool for citizen-driven street safety reporting.

---

## What It Does

StreetLightMeter turns any smartphone into a rough light meter. Users walk to a street they think is under-lit, point their phone's camera at the block, and the app estimates the ambient brightness. If the reading confirms the area is dark or dim, the app helps file a complaint to NYC 311 — with the exact lux reading, GPS coordinates, timestamp, and device information included in the report.

All readings are saved to a shared map, building a crowdsourced picture of where NYC's lighting falls short.

## How It Works

### Measuring Light

The app uses the phone's rear camera to estimate ambient brightness. When the user taps "Measure Light Here," the camera captures a single frame and analyzes pixel brightness across the image. This average brightness (on a 0–255 scale) is mapped to an approximate lux value using a calibration curve.

Readings are classified as:
- **Dark** (0–5 lux) — dangerously under-lit
- **Dim** (5–15 lux) — below pedestrian safety standards
- **Adequate** (15–30 lux) — meets minimum standards
- **Well Lit** (30+ lux) — sufficient lighting, no report needed

**Important caveat:** Phone cameras auto-adjust exposure, so these are approximate readings useful for relative comparison, not scientific measurement. The app is transparent about this.

### Reporting to 311

For Dark, Dim, and Adequate readings, the app offers three ways to report to NYC 311:

1. **File Online** — Opens the NYC DOT Street Lighting Repair Form directly
2. **Call 311** — Displays a word-for-word script of what to say, including the lux reading, address, date, and time. One tap to call.
3. **Text 311** — Composes a message to 311-692 with all report details pre-filled. One tap to send.

Well-lit areas (30+ lux) are saved to the map but the reporting options are hidden — there's nothing to report.

### Problem Types

Users can classify what they're seeing:
- Insufficient lighting in the area (general — not tied to a specific streetlight)
- Street light out
- Street light dim
- Flickering or cycling on and off
- Leaning or damaged pole

### Shared Map

Every reading is stored locally on the user's device and (when the backend is deployed) shared to a central API. The home screen map displays all readings as color-coded dots — red for dark, orange for dim, yellow for adequate, green for well-lit — building a collective picture over time.

### Duplicate Protection

The same device cannot report the same spot twice. A 50-meter radius check prevents repeated reports from the same location, both on the device (localStorage) and on the server (IP + geolocation check).

## Technical Details

- **Frontend:** Single HTML file, no build step. MapLibre GL JS for mapping, Nominatim for reverse geocoding.
- **Backend:** Cloudflare Worker with KV storage. Endpoints for reading/writing reports and serving GeoJSON.
- **Camera API:** Uses `getUserMedia` with `facingMode: 'environment'` — works on any phone with a rear camera (iPhone, Android, any model).
- **Privacy:** Camera images are analyzed locally in a canvas element and never uploaded. Only the computed lux value and GPS coordinates are stored.
- **Deployment:** GitHub Pages (static frontend) + Cloudflare Workers (API). Password-gated for preview access.

## Deployment

- **Live preview:** https://joshgreenman1973.github.io/streetlightmeter/
- **Backend setup:** See `worker/DEPLOY.md` for Cloudflare Worker deployment instructions
