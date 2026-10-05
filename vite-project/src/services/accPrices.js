/**
 * Panda Numbers - ACC Numbers price catalogue
 * ===========================================
 * Source of truth for the Buy Number catalogue (which services exist, their
 * cost and their stock per country).
 *
 * REAL RESPONSE SHAPE (fetched and inspected, not guessed).
 *
 * There are FOUR levels, not three:
 *
 *   countrySlug -> serviceId -> VARIANT -> { cost, count, rate... }
 *
 *   {
 *     "usa": {
 *       "whatsapp": {
 *         "virtual28": { "cost": 3938, "count": 21504, "rate": 53.19 },
 *         "virtual51": { "cost": 1838, "count": 0 },
 *         "virtual8":  { "cost": 1741, "count": 8251, "rate": 1.75 }
 *       }
 *     },
 *     "nigeria": {
 *       "whatsapp": { "virtual2": {...}, "virtual34": {...,"count":1207607} }
 *     }
 *   }
 *
 * - The top level is keyed by COUNTRY SLUG (155 of them).
 * - Level 2 keys are SERVICE IDs - real readable names ("whatsapp", "3fun").
 * - Level 3 keys are VARIANTS ("virtual28", "virtual51"). The variant id is
 *   per country for the same service: usa.whatsapp has virtual28/51/63/8,
 *   nigeria.whatsapp has virtual2/34. Of 155 countries, 152 expose more than
 *   one variant and NO country uses a single shared id. These ACC IDs are kept
 *   intact, but are not assumed to match another provider's service identifiers.
 *
 * Only { cost, count, rate* } appear inside a variant. Every one of the 54,452
 * service entries nests variants - there is no flat form to fall back to.
 *
 * Nothing here invents a service, a price or a stock figure. If the request
 * fails, callers get an error and are expected to show an error state - there is
 * deliberately no fallback catalogue.
 */
import { useEffect, useState } from "react";

// Must be a SAME-ORIGIN path, never the ACC host directly. The ACC endpoint
// returns no Access-Control-Allow-Origin header, so a browser fetch straight to
// it fails CORS before any of the handling below runs. /api/prices is served by
// server/index.js, which does the cross-origin call server-side.
const PRICES_URL = import.meta.env?.VITE_ACC_PRICES_URL || "/api/prices";

if (import.meta.env?.DEV && /^https?:/i.test(PRICES_URL)) {
  console.warn(
    `[accPrices] VITE_ACC_PRICES_URL points at ${PRICES_URL}. Unless that host ` +
      "sends CORS headers, the browser will block it. Use /api/prices.",
  );
}

// The catalogue is large (~1 MB) and changes slowly; cache it in memory for the
// session so switching country/service does not refetch.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = null;

/**
 * Fetch and normalize the catalogue.
 *
 * @returns {Promise<{
 *   countries: Record<string, {id:string, label:string, services: Record<string, {id:string, cost:number, count:number}>}>,
 *   serviceIds: string[]
 * }>}
 */
export async function fetchCatalogue({ signal, force = false } = {}) {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  let response;
  try {
    response = await fetch(PRICES_URL, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    // Aborting is a normal teardown, not a failure - re-throw so the hook's
    // AbortError check keeps working rather than reporting it as a real error.
    if (error?.name === "AbortError") throw error;
    throw new Error(
      "Could not reach the price catalogue. Check your connection and try again.",
      { cause: error },
    );
  }

  // A 429 or 5xx is the catalogue's own problem and is usually temporary, so it
  // is worth a retry; a 4xx means the request itself is wrong and is not.
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const error = new Error(
      response.status === 429
        ? "The price catalogue is rate-limiting requests. Please try again in a moment."
        : `Price catalogue request failed (${response.status}).`,
    );
    error.status = response.status;
    error.retryable = retryable;
    throw error;
  }

  let raw;
  try {
    raw = await response.json();
  } catch {
    // A 200 carrying HTML (captive portal, proxy error page) lands here. Saying
    // "unexpected shape" would describe a parsed value that never existed.
    throw new Error(
      "The price catalogue returned a response that is not valid JSON.",
    );
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `The price catalogue returned an unexpected shape (expected an object of countries, got ${
        Array.isArray(raw) ? "an array" : typeof raw
      }).`,
    );
  }

  // Normalize country -> service -> variant into a flat list while preserving
  // the original ACC identifiers for matching and diagnostics.
  const countries = {};
  const serviceIds = new Set();

  for (const [countrySlug, services] of Object.entries(raw)) {
    if (!services || typeof services !== "object") continue;

    const normalizedServices = {};

    for (const [serviceId, variants] of Object.entries(services)) {
      if (!variants || typeof variants !== "object") continue;

      for (const [variantId, info] of Object.entries(variants)) {
        // A variant holding anything other than an object cannot carry a cost
        // and a stock count, so it is not a buyable entry.
        if (!info || typeof info !== "object") continue;

        const cost = Number(info.cost);
        const count = Number(info.count);

        // An unusable variant is DROPPED rather than defaulted. Reporting a
        // missing count as 0 would hide a real number as "unavailable", and
        // reporting a missing cost as 0 would offer it as free.
        if (!Number.isFinite(cost) || !Number.isFinite(count)) continue;

        const id = `${serviceId}_${variantId}`;
        normalizedServices[id] = {
          id,
          // The bare service name, for display and for grouping.
          serviceId,
          variantId,
          cost,
          count,
        };
        serviceIds.add(id);
      }
    }

    countries[countrySlug] = {
      id: countrySlug,
      services: normalizedServices,
    };
  }

  const data = {
    countries,
    serviceIds: [...serviceIds].sort(),
    fetchedAt: Date.now(),
  };

  cache = { data, fetchedAt: Date.now() };
  return data;
}

/** Look up one service within one country. */
export function getServiceForCountry(catalogue, countrySlug, serviceId) {
  if (!catalogue || !countrySlug || !serviceId) return null;
  return catalogue.countries?.[countrySlug]?.services?.[serviceId] ?? null;
}

/**
 * All services available in a country, as display-ready entries.
 *
 * `stocked` filters to entries the provider actually has in stock.
 */
export function getCountryServices(
  catalogue,
  countrySlug,
  { stocked = false } = {},
) {
  const country = catalogue?.countries?.[countrySlug];
  if (!country) return [];

  const entries = Object.values(country.services);
  return stocked ? entries.filter((s) => s.count > 0) : entries;
}

/** Clear the in-memory cache (used by "Try again"). */
export function clearCatalogueCache() {
  cache = null;
}

/** React hook: load the catalogue with loading/error/retry state. */
export function useCatalogue() {
  const [catalogue, setCatalogue] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchCatalogue({ signal: controller.signal, force: reloadToken > 0 })
      .then((data) => {
        if (controller.signal.aborted) return;
        setCatalogue(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        setError(err);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [reloadToken]);

  // Retry resets the visible state BEFORE bumping the token. `isLoading` starts
  // as true, so the first load needs no reset - only a retry does.
  const retry = () => {
    clearCatalogueCache();
    setIsLoading(true);
    setError(null);
    setReloadToken((n) => n + 1);
  };

  return { catalogue, isLoading, error, retry };
}
