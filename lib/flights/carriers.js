// Carrier filtering for the fare tracker.
//
// The allowlist is the preferred filter (harder guarantee, better offers);
// the LCC blocklist is the fallback when a watch has no allowlist. Amadeus
// accepts includedAirlineCodes OR excludedAirlineCodes — never both in one
// call — and offers are re-filtered client-side afterwards as a safety net.

// oneworld members (2026): the carriers a Cathay flyer would actually accept.
export const ONEWORLD = [
  'AA', // American
  'AS', // Alaska
  'AT', // Royal Air Maroc
  'AY', // Finnair
  'BA', // British Airways
  'CX', // Cathay Pacific
  'FJ', // Fiji Airways
  'IB', // Iberia
  'JL', // Japan Airlines
  'MH', // Malaysia Airlines
  'QF', // Qantas
  'QR', // Qatar Airways
  'RJ', // Royal Jordanian
  'UL', // SriLankan
  'WY', // Oman Air
];

// Low-cost carriers reachable from Hong Kong and the wider region — the
// airlines a "no LCC" watch must never surface, whichever marketing shell
// they hide behind.
export const LCC_BLOCKLIST = [
  'UO', // HK Express
  'MM', // Peach
  'GK', // Jetstar Japan
  'JQ', // Jetstar
  '3K', // Jetstar Asia
  'TR', // Scoot
  'AK', // AirAsia
  'D7', // AirAsia X
  'FD', // Thai AirAsia
  'QZ', // Indonesia AirAsia
  'Z2', // AirAsia Philippines
  'VJ', // VietJet
  'VZ', // Thai Vietjet
  '5J', // Cebu Pacific
  'DG', // Cebgo
  'IT', // Tigerair Taiwan
  'TW', // T'way
  '7C', // Jeju Air
  'LJ', // Jin Air
  'BX', // Air Busan
  'RS', // Air Seoul
  '9C', // Spring Airlines
  'SL', // Thai Lion Air
  'JT', // Lion Air
  'OD', // Batik Air Malaysia
  '6E', // IndiGo
  'SG', // SpiceJet
  'FR', // Ryanair
  'U2', // easyJet
  'W6', // Wizz Air
  'VY', // Vueling
  'F9', // Frontier
  'NK', // Spirit
  'G4', // Allegiant
];

export function isLcc(code) {
  return LCC_BLOCKLIST.includes(String(code).toUpperCase());
}

/**
 * Every marketing AND operating carrier in the offer must clear the filter.
 * Applied after the Amadeus response regardless of what was requested
 * server-side.
 */
export function offerPassesCarrierFilter(offer, { airlinesOnly, excludeLcc }) {
  const codes = new Set();
  for (const itin of offer.itineraries ?? []) {
    for (const seg of itin.segments ?? []) {
      if (seg.carrierCode) codes.add(seg.carrierCode.toUpperCase());
      if (seg.operating?.carrierCode) codes.add(seg.operating.carrierCode.toUpperCase());
    }
  }
  if (codes.size === 0) return false;
  if (airlinesOnly?.length) {
    const allowed = airlinesOnly.map((c) => c.toUpperCase());
    for (const c of codes) if (!allowed.includes(c)) return false;
  }
  if (excludeLcc) {
    for (const c of codes) if (isLcc(c)) return false;
  }
  return true;
}
