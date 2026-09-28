import { useEffect, useState } from "react";

/**
 * Tracks an async load so a page can show its skeleton.
 *
 * The app has no live API yet, so passing no `loader` resolves after a short
 * simulated delay - long enough that the skeleton is genuinely visible instead
 * of flashing. When a real request exists, pass it as `loader` and the hook
 * will use its result:
 *
 *   const { isLoading, data, error } = usePageLoading(() => fetch("/api/x"));
 */
export function usePageLoading(loader, { delay = 550 } = {}) {
  const [state, setState] = useState({
    isLoading: true,
    data: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const run = async () => {
      try {
        const result = loader
          ? await loader({ signal: controller.signal })
          : await new Promise((resolve) => setTimeout(resolve, delay));

        if (!active) return;
        setState({ isLoading: false, data: result ?? null, error: null });
      } catch (error) {
        if (!active || error?.name === "AbortError") return;
        setState({ isLoading: false, data: null, error });
      }
    };

    run();
    return () => {
      active = false;
      controller.abort();
    };
    // Intentionally keyed on nothing: each mounted page loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
