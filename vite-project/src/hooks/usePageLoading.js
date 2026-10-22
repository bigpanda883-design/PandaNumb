import { useEffect, useRef, useState } from "react";

const LOADING_STATE = { isLoading: true, data: null, error: null };

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Runs `loader({ signal })` (or just waits `delay` ms when no loader is given)
 * and exposes { isLoading, data, error }.
 *
 * It re-runs when `delay` or anything in `deps` changes (for example a route
 * param or id). An inline `loader` function is fine: the latest one is used
 * without retriggering the effect on every render.
 */
export function usePageLoading(loader, { delay = 550, deps = [] } = {}) {
  const [state, setState] = useState(LOADING_STATE);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    const controller = new AbortController();

    // Show the loading state again when re-running for new deps.
    setState((prev) => (prev.isLoading ? prev : LOADING_STATE));

    const run = async () => {
      try {
        const currentLoader = loaderRef.current;
        const result = currentLoader
          ? await currentLoader({ signal: controller.signal })
          : await wait(delay, controller.signal);

        if (controller.signal.aborted) return;
        setState({ isLoading: false, data: result ?? null, error: null });
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setState({ isLoading: false, data: null, error });
      }
    };

    run();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, ...deps]);

  return state;
}
