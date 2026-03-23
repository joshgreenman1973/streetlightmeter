/**
 * Dark Spots API — Cloudflare Worker
 *
 * Stores and serves crowdsourced street light readings.
 * Uses KV for storage with a simple geo-index.
 *
 * Endpoints:
 *   GET  /readings          — all readings (paginated)
 *   GET  /readings/geojson  — all readings as GeoJSON FeatureCollection
 *   POST /readings          — submit a new reading
 *   GET  /health            — health check
 */

const DUPLICATE_RADIUS_M = 50;
const MAX_READINGS_PER_PAGE = 500;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // Route
      if (url.pathname === '/health') {
        return json({ status: 'ok', timestamp: new Date().toISOString() }, corsHeaders);
      }

      if (url.pathname === '/readings' && request.method === 'GET') {
        return handleGetReadings(env, url, corsHeaders);
      }

      if (url.pathname === '/readings/geojson' && request.method === 'GET') {
        return handleGetGeoJSON(env, corsHeaders);
      }

      if (url.pathname === '/readings' && request.method === 'POST') {
        return handlePostReading(request, env, corsHeaders);
      }

      return json({ error: 'Not found' }, corsHeaders, 404);
    } catch (e) {
      return json({ error: 'Internal error', detail: e.message }, corsHeaders, 500);
    }
  },
};

// ─── GET /readings ───
async function handleGetReadings(env, url, corsHeaders) {
  const cursor = url.searchParams.get('cursor') || undefined;
  const list = await env.READINGS.list({ limit: MAX_READINGS_PER_PAGE, cursor });

  const readings = await Promise.all(
    list.keys.map(async (key) => {
      const val = await env.READINGS.get(key.name, { type: 'json' });
      return val;
    })
  );

  return json({
    readings: readings.filter(Boolean),
    count: readings.length,
    cursor: list.list_complete ? null : list.cursor,
  }, corsHeaders);
}

// ─── GET /readings/geojson ───
async function handleGetGeoJSON(env, corsHeaders) {
  const allReadings = [];
  let cursor = undefined;
  let done = false;

  while (!done) {
    const list = await env.READINGS.list({ limit: MAX_READINGS_PER_PAGE, cursor });
    const batch = await Promise.all(
      list.keys.map(k => env.READINGS.get(k.name, { type: 'json' }))
    );
    allReadings.push(...batch.filter(Boolean));
    done = list.list_complete;
    cursor = list.cursor;
  }

  const geojson = {
    type: 'FeatureCollection',
    features: allReadings.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        lux: r.lux,
        problemType: r.problemType,
        address: r.address || '',
        timestamp: r.timestamp,
        color: luxColor(r.lux),
        label: luxLabel(r.lux),
      },
    })),
  };

  return json(geojson, corsHeaders);
}

// ─── POST /readings ───
async function handlePostReading(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, corsHeaders, 400);
  }

  // Validate required fields
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return json({ error: 'lat and lng are required numbers' }, corsHeaders, 400);
  }
  if (typeof body.lux !== 'number' || body.lux < 0 || body.lux > 1000) {
    return json({ error: 'lux must be a number between 0 and 1000' }, corsHeaders, 400);
  }

  // Sanitize
  const reading = {
    lat: body.lat,
    lng: body.lng,
    lux: body.lux,
    brightness: typeof body.brightness === 'number' ? body.brightness : null,
    accuracy: typeof body.accuracy === 'number' ? body.accuracy : null,
    address: typeof body.address === 'string' ? body.address.slice(0, 200) : '',
    problemType: typeof body.problemType === 'string' ? body.problemType.slice(0, 100) : 'Insufficient Lighting',
    timestamp: body.timestamp || Date.now(),
    reported: Boolean(body.reported),
    ip: request.headers.get('CF-Connecting-IP') || 'unknown',
  };

  // Duplicate check — same IP within 50m
  // Check recent readings in the same geohash cell
  const cellKey = geoCell(reading.lat, reading.lng);
  const cellData = await env.READINGS.get(`cell:${cellKey}`, { type: 'json' });
  if (cellData) {
    for (const existing of cellData) {
      if (existing.ip === reading.ip && haversineMeters(reading.lat, reading.lng, existing.lat, existing.lng) < DUPLICATE_RADIUS_M) {
        return json({ error: 'Duplicate report — you've already reported this spot', duplicate: true }, corsHeaders, 409);
      }
    }
  }

  // Store the reading with a unique key
  const id = `r:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.READINGS.put(id, JSON.stringify(reading));

  // Update cell index for duplicate detection
  const updatedCell = cellData || [];
  updatedCell.push({ lat: reading.lat, lng: reading.lng, ip: reading.ip, id });
  // Keep only last 50 per cell to prevent unbounded growth
  if (updatedCell.length > 50) updatedCell.shift();
  await env.READINGS.put(`cell:${cellKey}`, JSON.stringify(updatedCell));

  return json({ ok: true, id, reading }, corsHeaders, 201);
}

// ─── Helpers ───

function json(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Simple geohash cell (~100m precision) for grouping nearby readings
function geoCell(lat, lng) {
  return `${Math.round(lat * 1000)},${Math.round(lng * 1000)}`;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function luxColor(lux) {
  if (lux <= 5) return '#e7466d';
  if (lux <= 15) return '#ff7c53';
  if (lux <= 30) return '#dde44c';
  return '#4fbe5a';
}

function luxLabel(lux) {
  if (lux <= 5) return 'Dark';
  if (lux <= 15) return 'Dim';
  if (lux <= 30) return 'Adequate';
  return 'Well Lit';
}
