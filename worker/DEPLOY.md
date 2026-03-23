# Deploying the Dark Spots API

## Prerequisites
- A Cloudflare account (free tier works)
- Node.js installed

## Steps

### 1. Install dependencies
```
cd worker
npm install
```

### 2. Create the KV namespace
```
npx wrangler kv namespace create READINGS
npx wrangler kv namespace create READINGS --preview
```
Copy the `id` and `preview_id` values into `wrangler.toml`.

### 3. Deploy
```
npx wrangler deploy
```
This will output a URL like `https://dark-spots-api.your-subdomain.workers.dev`.

### 4. Connect the reporter app
In `index.html`, update the `API_BASE` constant:
```js
const API_BASE = 'https://dark-spots-api.your-subdomain.workers.dev';
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/readings` | All readings (paginated, JSON) |
| GET | `/readings/geojson` | All readings as GeoJSON |
| POST | `/readings` | Submit a new reading |
| GET | `/health` | Health check |

### POST /readings body
```json
{
  "lat": 40.7128,
  "lng": -74.006,
  "lux": 3.2,
  "brightness": 14,
  "accuracy": 12,
  "address": "123 Broadway, Financial District",
  "problemType": "Insufficient Lighting",
  "reported": false
}
```

Server-side duplicate detection: rejects reports from the same IP within 50m of an existing report (HTTP 409).
