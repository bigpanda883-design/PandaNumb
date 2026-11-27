/**
 * Operator-set selling prices
 * ==========================
 *
 * `server/pricing.js` decides the price automatically from the provider's cost.
 * This module is the one override on top of it: when an administrator sets a
 * selling price for a specific country/card/variant on the Numbers Inventory
 * screen, that price is what the customer is charged.
 *
 * The reader is REGISTERED by db.js (`applySellingPriceOverride`) instead of
 * imported, so pricing.js never imports the database and there is no cycle:
 *
 *   db.js  ──imports──>  priceOverrides.js  <──imports──  pricing.js
 *
 * Overrides live in memory and are reloaded by the writer, so the Buy page and
 * the purchase route see a change on the next request without a restart. Only
 * the price we charge is overridden - the provider cost is never touched.
 */

/** @type {null | (() => Map<string, {price:number}>) } */
let reader = null;

/** @type {Map<string, {price:number}> | null} */
let cache = null;

/** Called once by db.js with its getPriceOverrideMap function. */
export function applySellingPriceOverride(fn) {
  reader = typeof fn === "function" ? fn : null;
  cache = null;
}

function overrideKey(countrySlug, cardId, variantId) {
  return `${countrySlug}|${cardId}|${variantId}`;
}

/** The active overrides map, loaded lazily and refreshed by reload(). */
function overrides() {
  if (!cache && reader) {
    try {
      cache = reader();
    } catch {
      cache = new Map();
    }
  }
  return cache || new Map();
}

/** Drop the cache so the next read sees prices just written. */
export function reloadSellingPriceOverrides() {
  cache = null;
  return overrides().size;
}

/**
 * Does the operator's own price replace the computed one here?
 *
 * @returns {null | number} the override in whole naira, or null when the
 *   automatic price from pricing.js still applies.
 */
export function getSellingPriceOverride(countrySlug, cardId, variantId) {
  if (!countrySlug || !cardId) return null;
  const entry = overrides().get(overrideKey(countrySlug, cardId, variantId));
  if (!entry) return null;
  const price = Number(entry.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Every override for one country/card, keyed by variant id. */
export function getSellingPriceOverridesFor(countrySlug, cardId) {
  const found = {};
  const prefix = `${countrySlug}|${cardId}|`;
  for (const [key, entry] of overrides()) {
    if (!key.startsWith(prefix)) continue;
    const variantId = key.slice(prefix.length);
    const price = Number(entry.price);
    if (Number.isFinite(price) && price > 0) found[variantId] = price;
  }
  return found;
}
