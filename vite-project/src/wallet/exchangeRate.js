/**
 * Panda Numbers - exchange rate service
 * -------------------------------------------------
 * Fetches the live USD -> NGN rate. No rate is hardcoded in the UI; the only
 * built-in number is the last-resort fallback used when the network fails, and
 * that fallback is clearly flagged to the caller so the UI can say "offline
 * rate" instead of silently presenting a stale figure.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Public no-key endpoint. Override with VITE_EXCHANGE_RATE_ENDPOINT to point at
 * your own backend instead.
 */
const DEFAULT_ENDPOINT = "https://open.er-api.com/v6/latest/USD";

const CACHE_KEY = "panda-numbers-usd-ngn-rate";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Used only if both the network and the cache are unavailable. Marked as a
// fallback so the UI never presents it as a live rate.
const FALLBACK_RATE = 1500;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.rate !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(rate) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ rate, fetchedAt: Date.now() }),
    );
  } catch {
    // Non-fatal: the rate still lives in React state for this session.
  }
}

/**
 * Fetch the current USD -> NGN rate.
 * @returns {Promise<{rate:number, fetchedAt:number, isFallback:boolean}>}
 */
export async function fetchUsdToNgnRate({ signal } = {}) {
  const endpoint =
    import.meta.env?.VITE_EXCHANGE_RATE_ENDPOINT || DEFAULT_ENDPOINT;

  try {
    const response = await fetch(endpoint, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Rate request failed (${response.status})`);
    }

    const data = await response.json();
    // open.er-api.com returns { rates: { NGN: n } }; a custom backend may
    // instead return { rate } or { ngn }. Accept all three.
    const rate = data?.rates?.NGN ?? data?.rate ?? data?.ngn;

    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("Rate endpoint returned no usable USD/NGN value");
    }

    writeCache(rate);
    return { rate, fetchedAt: Date.now(), isFallback: false };
  } catch (error) {
    if (error?.name === "AbortError") throw error;

    // A recent cached rate is better than cold-stopping the dashboard.
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS * 4) {
      return {
        rate: cached.rate,
        fetchedAt: cached.fetchedAt,
        isFallback: true,
        error,
      };
    }

    return {
      rate: FALLBACK_RATE,
      fetchedAt: Date.now(),
      isFallback: true,
      error,
    };
  }
}

/**
 * React hook wrapping the fetch with explicit loading / error / fallback state.
 * The dashboard uses this so it never renders a guessed rate as if it were live.
 */
export function useUsdToNgnRate() {
  const [state, setState] = useState({
    rate: null,
    isLoading: true,
    error: null,
    isFallback: false,
  });
  const mounted = useRef(true);

  // `isLoading` is already true in the initial state, so the mount load does not
  // need to set it. A retry does, and `retry` below handles that itself.
  const load = useCallback(async (signal) => {
    try {
      const result = await fetchUsdToNgnRate({ signal });
      if (!mounted.current) return;
      setState({
        rate: result.rate,
        isLoading: false,
        error: result.error ?? null,
        isFallback: result.isFallback,
      });
    } catch (error) {
      if (!mounted.current || error?.name === "AbortError") return;
      setState({
        rate: null,
        isLoading: false,
        error,
        isFallback: false,
      });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    // Deferred so the effect body itself does not set state during the commit;
    // the fetch then drives the later state updates.
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) load(controller.signal);
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [load]);

  const retry = useCallback(() => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    return load();
  }, [load]);

  return { ...state, retry };
}
