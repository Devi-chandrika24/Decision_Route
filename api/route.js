/**
 * api/route.js — Serverless proxy for OpenRouteService Directions API
 *
 * Compatible with: Vercel, Netlify Functions (with minor adapter wrapping)
 *
 * Why this proxy exists:
 *   OpenRouteService requires an Authorization header containing the API key.
 *   Putting that key in browser JS would expose it publicly — anyone could
 *   consume the free-tier quota or abuse it. This 15-line proxy keeps the
 *   key server-side, in the ORS_KEY environment variable.
 *
 * What it does:
 *   POST /api/route
 *   Body: { coordinates, alternative_routes, ... } (standard ORS request body)
 *   Returns: raw ORS JSON response
 *
 * Vercel deployment:
 *   1. Add ORS_KEY to Vercel project environment variables (Dashboard → Settings → Env)
 *   2. The /api/route.js file is automatically picked up as a serverless function
 *
 * Netlify deployment:
 *   Move this file to netlify/functions/route.js and adjust the export shape to:
 *     export const handler = async (event) => { ... return { statusCode, body } }
 */

const ORS_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

/**
 * Vercel serverless handler.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 */
export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const orsKey = process.env.ORS_KEY;
  if (!orsKey) {
    res.status(500).json({ error: 'ORS_KEY environment variable not set.' });
    return;
  }

  // Parse and re-stream the request body
  let body = '';
  for await (const chunk of req) body += chunk;

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.status(400).json({ error: 'Request body must be valid JSON.' });
    return;
  }

  // Forward to OpenRouteService
  try {
    const orsRes = await fetch(ORS_ENDPOINT, {
      method : 'POST',
      headers: {
        'Authorization': orsKey,
        'Content-Type' : 'application/json; charset=utf-8',
        'Accept'       : 'application/json',
      },
      body: JSON.stringify(parsed),
    });

    const data = await orsRes.json();

    // Pass through the ORS status code so the client can distinguish 400 vs 500
    res.status(orsRes.status).json(data);

  } catch (err) {
    // Network-level failure reaching ORS
    res.status(502).json({
      error : 'Could not reach OpenRouteService.',
      detail: err.message,
    });
  }
}
