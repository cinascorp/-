import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(__dirname));

async function proxyJson(res, url, headers = {}) {
  try {
    const response = await fetch(url, { headers });
    const text = await response.text();
    // Always send as JSON-ish to allow client to parse; FR24 may serve JS
    res.setHeader('content-type', 'application/json');
    res.status(response.status).send(text);
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', detail: String(error) });
  }
}

// Proxy for Flightradar24 feed.js
app.get('/proxy/fr24', async (req, res) => {
  const baseUrl = 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js';
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
  // Provide safe defaults if caller omitted query
  const defaultParams = 'faa=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0';
  const url = qs ? `${baseUrl}?${qs}` : `${baseUrl}?${defaultParams}`;
  await proxyJson(res, url, { 'user-agent': 'Mozilla/5.0' });
});

// Proxy for ADSB.lol military
app.get('/proxy/adsb-mil', async (_req, res) => {
  const url = 'https://api.adsb.lol/v2/mil';
  await proxyJson(res, url, { 'user-agent': 'Mozilla/5.0' });
});

// Serve the 3D map demo
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'map.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
