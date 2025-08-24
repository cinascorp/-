const mapEl = document.getElementById('map3d');

// We will create markers as DOM elements and attach with gmp-advanced-marker if available.
// Fallback: draw simple floating elements with CSS overlay positions won't be trivial, so prefer advanced markers.

function createAircraftIcon(color = '#ffcc00', rotationDeg = 0, title = '') {
  const container = document.createElement('div');
  container.style.width = '18px';
  container.style.height = '18px';
  container.style.transform = `rotate(${rotationDeg}deg)`;
  container.style.transformOrigin = '50% 50%';

  const triangle = document.createElement('div');
  triangle.style.width = '0';
  triangle.style.height = '0';
  triangle.style.borderLeft = '9px solid transparent';
  triangle.style.borderRight = '9px solid transparent';
  triangle.style.borderBottom = `18px solid ${color}`;
  triangle.style.opacity = '0.9';

  container.appendChild(triangle);
  container.title = title;
  return container;
}

// Track aircraft markers by a unique key
const aircraftIdToMarker = new Map();

// Utilities to parse endpoints
function parseFR24(raw) {
  // FR24 feed.js returns JS-like JSON with many keys; flights keyed by hex or number indices
  // Example structure: { full_count: n, version: x, 'abc123': [lat, lon, track, alt, speed, ...], ... }
  const flights = [];
  if (!raw || typeof raw !== 'object') return flights;
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value) && value.length >= 5) {
      const lat = value[1];
      const lon = value[2];
      const track = value[3]; // degrees
      const alt = value[4];
      const callsign = value[16] || key; // index varies; use key fallback
      if (typeof lat === 'number' && typeof lon === 'number') {
        flights.push({ id: `fr24:${key}`, lat, lon, heading: Number(track) || 0, alt: Number(alt) || 0, callsign: String(callsign || '') });
      }
    }
  }
  return flights;
}

function parseADSBMil(raw) {
  const flights = [];
  if (!raw || typeof raw !== 'object') return flights;
  const arr = raw.ac || raw.aircraft || raw.states || [];
  for (const item of arr) {
    const lat = item.lat ?? item.latitude;
    const lon = item.lon ?? item.longitude;
    const track = item.track ?? item.heading ?? item.bearing ?? 0;
    const alt = item.alt_baro ?? item.alt_geometric ?? item.altitude ?? 0;
    const id = item.hex || item.icao || item.flight || item.callsign || Math.random().toString(36).slice(2);
    const callsign = item.flight || item.callsign || id;
    if (typeof lat === 'number' && typeof lon === 'number') {
      flights.push({ id: `mil:${id}`, lat, lon, heading: Number(track) || 0, alt: Number(alt) || 0, callsign: String(callsign || '') });
    }
  }
  return flights;
}

async function fetchFR24(bounds) {
  // bounds: t,l,b,r (N,S,W,E) in FR24 format. We'll pass as is.
  const params = bounds ? `?bounds=${encodeURIComponent(bounds)}&faa=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0` : '';
  const res = await fetch(`/proxy/fr24${params}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Some FR24 responses are JS without strict JSON; try to eval safely
    return Function(`"use strict";return (${text})`)();
  }
}

async function fetchADSBMil() {
  const res = await fetch('/proxy/adsb-mil');
  return res.json();
}

function upsertMarker(flight) {
  const key = flight.id;
  const rotation = flight.heading || 0;
  const title = `${flight.callsign || key} alt:${flight.alt}`;

  let marker = aircraftIdToMarker.get(key);
  if (!marker) {
    const icon = createAircraftIcon('#ffcc00', rotation, title);
    const markerEl = document.createElement('gmp-advanced-marker');
    markerEl.setAttribute('title', title);
    markerEl.position = { lat: flight.lat, lng: flight.lon };
    const imgSlot = document.createElement('div');
    imgSlot.setAttribute('slot', 'icon');
    imgSlot.appendChild(icon);
    markerEl.appendChild(imgSlot);
    mapEl.appendChild(markerEl);
    aircraftIdToMarker.set(key, { markerEl, icon });
  } else {
    marker.markerEl.position = { lat: flight.lat, lng: flight.lon };
    marker.icon.style.transform = `rotate(${rotation}deg)`;
    marker.markerEl.setAttribute('title', title);
  }
}

function removeMissingMarkers(currentIds) {
  for (const [id, { markerEl }] of Array.from(aircraftIdToMarker.entries())) {
    if (!currentIds.has(id)) {
      markerEl.remove();
      aircraftIdToMarker.delete(id);
    }
  }
}

function getBoundsFromMapEl() {
  // For now, use a large area centered around the map's center. FR24 bounds format: t,l,b,r (N, W, S, E)
  // Using a wide box to ensure results; adjust as needed.
  const centerAttr = mapEl.getAttribute('center');
  if (!centerAttr) return null;
  const parts = centerAttr.split(',').map(Number);
  const lat = parts[0];
  const lon = parts[1];
  const dLat = 5;
  const dLon = 5;
  const t = Math.min(90, lat + dLat);
  const b = Math.max(-90, lat - dLat);
  const l = Math.max(-180, lon - dLon);
  const r = Math.min(180, lon + dLon);
  // FR24 expects top, bottom, left, right? Historically it's bbox: tl_y, br_y, tl_x, br_x; but many docs show north,south,west,east
  // We'll send as north,south,west,east
  return `${t},${b},${l},${r}`;
}

async function refresh() {
  const bounds = getBoundsFromMapEl();
  const [fr24Raw, adsbRaw] = await Promise.allSettled([
    fetchFR24(bounds),
    fetchADSBMil()
  ]);

  const flights = [];
  if (fr24Raw.status === 'fulfilled') flights.push(...parseFR24(fr24Raw.value));
  if (adsbRaw.status === 'fulfilled') flights.push(...parseADSBMil(adsbRaw.value));

  const ids = new Set();
  for (const f of flights) {
    ids.add(f.id);
    upsertMarker(f);
  }
  removeMissingMarkers(ids);
}

function start() {
  refresh();
  setInterval(refresh, 15000);
}

document.addEventListener('DOMContentLoaded', start);