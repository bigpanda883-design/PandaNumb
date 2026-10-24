/**
 * Panda Numbers - ACC Numbers Price Catalogue
 */

import { useCallback, useEffect, useState } from "react";
import { getApiBaseUrl } from "./httpClient.js";

const PRICES_PATH = import.meta.env?.VITE_ACC_PRICES_URL || "/api/prices";

function resolvePricesUrl() {
  const path = PRICES_PATH.trim();

  if (/^https?:\/\//i.test(path)) {
    return path.replace(/\/+$/, "");
  }

  const base = (getApiBaseUrl() || "").replace(/\/+$/, "");
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;

  return `${base}${normalizedPath}`;
}

const PRICES_URL = resolvePricesUrl();
const PRICES_STATUS_URL = `${PRICES_URL}/status`;

const FETCH_TIMEOUT_MS = 90 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache = null;

/**
 * Check whether the backend is building the catalogue.
 */
export async function fetchCatalogueStatus({ signal } = {}) {
  try {
    const response = await fetch(PRICES_STATUS_URL, {
      signal,
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(
        `[accPrices] Status endpoint returned HTTP ${response.status}`,
      );
      return null;
    }

    const status = await response.json();

    if (!status || typeof status !== "object") {
      return null;
    }

    return status;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    console.warn(
      "[accPrices] Could not check catalogue status:",
      error?.message || error,
    );

    return null;
  }
}

/**
 * Check whether the URL points to another origin.
 */
function isCrossOrigin(url) {
  try {
    if (typeof window === "undefined") return false;

    return (
      new URL(url, window.location.origin).origin !== window.location.origin
    );
  } catch {
    return false;
  }
}

const PRICES_IS_CROSS_ORIGIN = isCrossOrigin(PRICES_URL);

if (import.meta.env?.DEV && PRICES_IS_CROSS_ORIGIN) {
  console.warn(
    `[accPrices] VITE_ACC_PRICES_URL points at ${PRICES_URL}. ` +
      "Ensure the backend supports CORS. Prefer /api/prices.",
  );
}

/**
 * Return the cached catalogue if it is still fresh.
 */
export function getCachedCatalogue() {
  if (!cache) return null;

  const age = Date.now() - cache.fetchedAt;
  const isFresh = age >= 0 && age < CACHE_TTL_MS;

  if (isFresh) return cache.data;

  cache = null;
  return null;
}

/**
 * Parse a valid number without treating missing values as zero.
 */
function toFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && /^\s*[+-]?\d+(?:\.\d+)?\s*$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Extract the longest stated holding duration from rateNN keys.
 */
function toHoldHours(info) {
  let hold = null;

  for (const key of Object.keys(info)) {
    const match = /^rate(\d+)$/.exec(key);

    if (!match || Number(match[1]) <= 0) continue;

    const hours = Number(match[1]);

    if (hold === null || hours > hold) {
      hold = hours;
    }
  }

  return hold;
}

const ACRONYMS = new Set(["usa", "uk", "uae", "drc"]);
const SMALL_WORDS = new Set(["and", "of", "the"]);

/**
 * Convert a country slug into a readable label.
 * Example: south-africa -> South Africa.
 */
function labelFromSlug(slug) {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase();

      if (ACRONYMS.has(lower)) {
        return lower.toUpperCase();
      }

      if (index > 0 && SMALL_WORDS.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Fetch and normalize the real ACC catalogue through our backend.
 */
async function fetchFresh(signal, force = false) {
  let response;

  try {
    response = await fetch(PRICES_URL, {
      signal,
      headers: {
        Accept: "application/json",
      },
      // NOT "reload". The 10 MB catalogue is served with a short max-age, so a
      // normal request can be answered by the HTTP cache - a re-opening of the
      // Buy page then costs no download and no JSON.parse. "reload" bypassed
      // that cache on every mount, which is why the page was slow each time.
      cache: force ? "reload" : "default",
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    const networkError = new Error(
      PRICES_IS_CROSS_ORIGIN
        ? "Could not reach the price catalogue. Check your connection and ensure the request goes through the backend API. Direct provider requests may be blocked by CORS."
        : "Could not reach the price catalogue. Check your connection and try again.",
      { cause: error },
    );

    networkError.retryable = true;
    throw networkError;
  }

  if (!response.ok) {
    const retryable =
      response.status === 404 ||
      response.status === 429 ||
      response.status >= 500;

    let message;

    if (response.status === 404) {
      message =
        "The price catalogue endpoint was not found (404). Check the backend API URL and route.";
    } else if (response.status === 429) {
      message =
        "The price catalogue is rate-limiting requests. Please try again shortly.";
    } else {
      message = `Price catalogue request failed (${response.status}).`;
    }

    const error = new Error(message);
    error.status = response.status;
    error.retryable = retryable;

    throw error;
  }

  let raw;

  try {
    raw = await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new Error(
      "The price catalogue returned a response that is not valid JSON.",
      { cause: error },
    );
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `The price catalogue returned an unexpected shape. Expected an object, received ${
        Array.isArray(raw) ? "an array" : typeof raw
      }.`,
    );
  }

  // The backend answers { countries, sold, catalogueServiceByCard,
  // serviceStatus, pricedAt }, where `countries[slug][cardId]` holds the priced
  // variants of one Buy card. A bare country map is still accepted so an older
  // deploy keeps working.
  const countryMap =
    raw.countries && typeof raw.countries === "object" ? raw.countries : raw;

  const catalogueServiceByCard =
    raw.catalogueServiceByCard &&
    typeof raw.catalogueServiceByCard === "object" &&
    !Array.isArray(raw.catalogueServiceByCard)
      ? raw.catalogueServiceByCard
      : Object.create(null);

  const countries = Object.create(null);
  const serviceIds = new Set();

  for (const [countrySlug, services] of Object.entries(countryMap)) {
    if (countrySlug === "sold" || countrySlug === "serviceStatus") continue;
    if (!services || typeof services !== "object" || Array.isArray(services)) {
      continue;
    }

    // Two levels: cardId -> variants (a card is one service on the Buy page).
    const normalizedServices = Object.create(null);

    for (const [cardId, variants] of Object.entries(services)) {
      if (
        !variants ||
        typeof variants !== "object" ||
        Array.isArray(variants)
      ) {
        continue;
      }

      // A card whose variants live in another catalogue service ("gmail" ->
      // "google"). The purchase route resolves this the same way on the server;
      // this copy is only used for display and offer ids.
      const catalogueService = catalogueServiceByCard[cardId] || cardId;

      for (const [variantId, info] of Object.entries(variants)) {
        if (!info || typeof info !== "object" || Array.isArray(info)) {
          continue;
        }

        const cost = toFiniteNumber(info.cost);
        const count = toFiniteNumber(info.count);
        const price = toFiniteNumber(info.price);

        // Never invent a price or stock figure.
        if (cost === null || cost <= 0) continue;
        if (count === null || count < 0) continue;

        const holdHours = toHoldHours(info);
        const id = `${cardId}_${variantId}`;

        normalizedServices[id] = {
          id,
          serviceId: cardId,
          catalogueService,
          variantId,
          cost,
          count,
          holdHours,
          // The SELLING price from the backend. null means this variant cannot
          // be sold profitably right now (see `blocked`), so it is never shown
          // as available and never falls back to the provider cost.
          price: price !== null && price > 0 ? price : null,
          profit: toFiniteNumber(info.profit),
          tier: typeof info.tier === "string" ? info.tier : null,
          blocked: typeof info.blocked === "string" ? info.blocked : null,
        };

        serviceIds.add(id);
      }
    }

    countries[countrySlug] = {
      id: countrySlug,
      label: labelFromSlug(countrySlug),
      services: normalizedServices,
    };
  }

  if (serviceIds.size === 0) {
    const error = new Error(
      "The price catalogue did not contain any usable entries. Please try again.",
    );

    error.retryable = true;
    throw error;
  }

  const sold =
    raw.sold && typeof raw.sold === "object" && !Array.isArray(raw.sold)
      ? raw.sold
      : Object.create(null);

  const serviceStatus =
    raw.serviceStatus &&
    typeof raw.serviceStatus === "object" &&
    !Array.isArray(raw.serviceStatus)
      ? raw.serviceStatus
      : Object.create(null);

  const fetchedAt = Date.now();

  const data = {
    countries,
    sold,
    catalogueServiceByCard,
    serviceStatus,
    serviceIds: [...serviceIds].sort(),
    fetchedAt,
  };

  cache = {
    data,
    fetchedAt,
  };

  return data;
}

/**
 * Fetch the catalogue with timeout and cache support.
 */
export async function fetchCatalogue({ signal, force = false } = {}) {
  if (!force) {
    const cached = getCachedCatalogue();

    if (cached) return cached;
  }

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  const onCallerAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onCallerAbort, {
        once: true,
      });
    }
  }

  try {
    return await fetchFresh(controller.signal, force);
  } catch (error) {
    if (error?.name === "AbortError" && timedOut) {
      const timeoutError = new Error(
        "The price catalogue took too long to respond. Please try again.",
      );

      timeoutError.retryable = true;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

/**
 * Get one service entry for a specific country.
 */
export function getServiceForCountry(catalogue, countrySlug, serviceId) {
  if (!catalogue || !countrySlug || !serviceId) {
    return null;
  }

  return catalogue.countries?.[countrySlug]?.services?.[serviceId] ?? null;
}

/**
 * Get all services for a country.
 */
export function getCountryServices(
  catalogue,
  countrySlug,
  { stocked = false } = {},
) {
  const country = catalogue?.countries?.[countrySlug];

  if (!country) return [];

  const entries = Object.values(country.services);

  return stocked ? entries.filter((service) => service.count > 0) : entries;
}

/**
 * Get available offers for one service in one country,
 * sorted by lowest real selling price.
 *
 * A variant without a usable selling price is left out: it is priced by the
 * backend and `price: null` means it must not be offered.
 */
export function getServiceOffers(
  catalogue,
  countrySlug,
  serviceId,
  { limit = 2 } = {},
) {
  const services = catalogue?.countries?.[countrySlug]?.services;

  if (!services || !serviceId) return [];

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 2;

  return Object.values(services)
    .filter(
      (entry) =>
        entry.serviceId === serviceId &&
        entry.count > 0 &&
        Number.isFinite(entry.price) &&
        entry.price > 0,
    )
    .sort(
      (left, right) =>
        left.price - right.price ||
        left.cost - right.cost ||
        right.count - left.count,
    )
    .slice(0, safeLimit)
    .map((entry, index) => ({
      id: entry.id,
      label: index === 0 ? "Lowest price" : "Next tier",
      price: entry.price,
      cost: entry.cost,
      count: entry.count,
      variantId: entry.variantId,
      holdHours: entry.holdHours,
    }));
}

/**
 * Clear the in-memory catalogue cache.
 */
export function clearCatalogueCache() {
  cache = null;
}

/**
 * React hook for catalogue loading, errors, warming-up status,
 * and retry functionality.
 */
export function useCatalogue() {
  const [catalogue, setCatalogue] = useState(getCachedCatalogue);

  const [isLoading, setIsLoading] = useState(() => !getCachedCatalogue());

  const [error, setError] = useState(null);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    let pollTimer = null;
    let cancelled = false;

    async function pollStatus() {
      if (cancelled) return;

      const status = await fetchCatalogueStatus({
        signal: controller.signal,
      }).catch(() => null);

      if (cancelled) return;

      if (status?.loading && !status?.ready) {
        setIsWarmingUp(true);
        pollTimer = setTimeout(pollStatus, 2000);
      } else {
        setIsWarmingUp(false);
      }
    }

    pollStatus();

    fetchCatalogue({
      signal: controller.signal,
      force: reloadToken > 0,
    })
      .then((data) => {
        if (controller.signal.aborted) return;

        setCatalogue(data);
        setError(null);
        setIsLoading(false);
        setIsWarmingUp(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") {
          return;
        }

        setError(err);
        setIsLoading(false);
        setIsWarmingUp(false);
      });

    return () => {
      cancelled = true;

      if (pollTimer) {
        clearTimeout(pollTimer);
      }

      controller.abort();
    };
  }, [reloadToken]);

  const retry = useCallback(() => {
    clearCatalogueCache();
    setIsLoading(true);
    setError(null);
    setReloadToken((n) => n + 1);
  }, []);

  return {
    catalogue,
    isLoading,
    error,
    isWarmingUp,
    retry,
  };
}
