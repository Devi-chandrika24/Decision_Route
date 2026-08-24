/**
 * server.js — Local development server for DecisionRoute
 *
 * Responsibilities:
 *  1. Serve static files from ./src
 *  2. Proxy /api/route → OpenRouteService (keeps ORS_KEY off the client)
 *
 * Usage:
 *   node server.js           (reads PORT from .env, default 3000)
 *
 * .env format:
 *   ORS_KEY=your_key_here
 *   PORT=3000
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Resolve paths ────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR   = path.join(__dirname, 'src');

// ─── Load .env manually (zero dependencies) ───────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const PORT    = parseInt(process.env.PORT || '3000', 10);
const ORS_KEY = process.env.ORS_KEY || '';

// ─── MIME type table ──────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg' : 'image/svg+xml',
  '.png' : 'image/png',
  '.ico' : 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ─── Static file handler ──────────────────────────────────────────────────────
function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(SRC_DIR, urlPath);

  // Security: prevent directory traversal outside SRC_DIR
  if (!filePath.startsWith(SRC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  // Service workers require a special header to declare their scope
  const extraHeaders = urlPath === '/sw.js'
    ? { 'Service-Worker-Allowed': '/' }
    : {};

  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': 'no-cache',
    ...extraHeaders,
  });
  fs.createReadStream(filePath).pipe(res);
}

// ─── ORS proxy handler ────────────────────────────────────────────────────────
async function proxyORS(req, res) {
  if (!ORS_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ORS_KEY not configured in .env' }));
    return;
  }

  // Read POST body
  let body = '';
  for await (const chunk of req) body += chunk;

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  // Forward to ORS
  try {
    const orsRes = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      {
        method : 'POST',
        headers: {
          'Authorization': ORS_KEY,
          'Content-Type' : 'application/json; charset=utf-8',
          'Accept'       : 'application/json',
        },
        body: JSON.stringify(parsed),
      }
    );

    const data = await orsRes.json();
    res.writeHead(orsRes.status, {
      'Content-Type' : 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upstream ORS request failed', detail: err.message }));
  }
}

// ─── Main request dispatcher ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin' : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.url.startsWith('/api/route') && req.method === 'POST') {
    await proxyORS(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀  DecisionRoute dev server running`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   ORS key: ${ORS_KEY ? '✓ loaded' : '✗ missing — add ORS_KEY to .env'}\n`);
});
