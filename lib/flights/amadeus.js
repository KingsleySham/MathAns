// Amadeus Self-Service client — flight-offers search only.
//
// Chosen because /v2/shopping/flight-offers accepts includedAirlineCodes /
// excludedAirlineCodes as query parameters, so carrier filtering happens
// server-side before we pay for the response. Amadeus rejects requests
// carrying both parameters, so callers pick one (allowlist preferred).
//
// AMADEUS_HOST=test.api.amadeus.com serves cached, non-live fares — fine
// for building, and the tracker labels which environment produced a quote.

const HOST = () => process.env.AMADEUS_HOST || 'test.api.amadeus.com';

// OAuth tokens live ~30 minutes; cache per warm instance and refresh with a
// one-minute safety margin.
let tokenCache = { token: null, expiresAt: 0 };

export function amadeusConfigured() {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}

export function amadeusEnvironment() {
  return HOST() === 'api.amadeus.com' ? 'production' : 'test';
}

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(`https://${HOST()}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AMADEUS_CLIENT_ID,
      client_secret: process.env.AMADEUS_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    // Never echo the request body — it carries the client secret.
    throw new Error(`amadeus auth failed: ${res.status}`);
  }
  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 1799) * 1000,
  };
  return tokenCache.token;
}

export class AmadeusRateLimited extends Error {
  constructor() {
    super('amadeus rate limited (429)');
    this.rateLimited = true;
  }
}

/**
 * One flight-offers search. Pass includedAirlineCodes OR excludedAirlineCodes,
 * never both. Throws AmadeusRateLimited on 429 so the sweep can stop cleanly.
 */
export async function searchFlightOffers({
  origin,
  destination,
  departureDate,
  returnDate,
  cabin,
  includedAirlineCodes,
  excludedAirlineCodes,
  max = 20,
}) {
  if (includedAirlineCodes?.length && excludedAirlineCodes?.length) {
    throw new Error('amadeus accepts includedAirlineCodes or excludedAirlineCodes, not both');
  }
  const params = new URLSearchParams({
    originLocationCode: origin,
    destinationLocationCode: destination,
    departureDate,
    adults: '1',
    currencyCode: 'HKD',
    max: String(max),
  });
  if (returnDate) params.set('returnDate', returnDate);
  if (cabin) params.set('travelClass', cabin);
  if (includedAirlineCodes?.length) params.set('includedAirlineCodes', includedAirlineCodes.join(','));
  else if (excludedAirlineCodes?.length) params.set('excludedAirlineCodes', excludedAirlineCodes.join(','));

  const token = await getToken();
  const res = await fetch(`https://${HOST()}/v2/shopping/flight-offers?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) throw new AmadeusRateLimited();
  if (!res.ok) throw new Error(`amadeus search failed: ${res.status}`);
  const data = await res.json();
  return data.data ?? [];
}

/**
 * Map an Amadeus branded-fare label onto Cathay's three brands.
 * Returns null when the response carries no usable brand — the caller
 * decides how to present the uncertainty, not this function.
 */
export function fareTypeFromBrand(brandedFare, brandedFareLabel) {
  const s = `${brandedFare ?? ''} ${brandedFareLabel ?? ''}`.toUpperCase();
  if (s.includes('LIGHT')) return 'light';
  if (s.includes('ESSENTIAL')) return 'essential';
  if (s.includes('FLEX')) return 'flex';
  return null;
}
