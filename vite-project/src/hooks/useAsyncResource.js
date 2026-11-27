/**
 * One async resource (load / reload / error state) for the admin screens.
 *
 * Every admin page does the same thing: call an endpoint, show a spinner, show
 * an error, show the data, and be able to reload quietly in the background.
 * This hook keeps that logic in one place so each page stays declarative.
 *
 * It is written to satisfy the project's React rules:
 *   - no refs written during render,
 *   - no setState synchronously inside an effect body (react-hooks/set-state-in-effect).
 * The first load is deferred one microtask, which keeps it out of the commit
 * phase while still running immediately after mount.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export default function useAsyncResource(loader, deps = []) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  // The loader is read from a ref that only an EFFECT updates, so the latest
  // closure is always used without the function itself becoming a dependency.
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }
    try {
      const data = await loaderRef.current();
      if (mountedRef.current) setState({ loading: false, error: "", data });
      return data;
    } catch (error) {
      if (mountedRef.current) {
        setState({
          loading: false,
          error: error?.message || "This data could not be loaded.",
          data: null,
        });
      }
      return null;
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.resolve().then(() => run());
    // `deps` is the caller's list of values that mean "fetch again".
  }, deps);

  const reload = useCallback(() => run({ silent: true }), [run]);
  const refresh = useCallback(() => run(), [run]);

  return {
    loading: state.loading,
    error: state.error,
    data: state.data,
    reload,
    refresh,
    setData: (data) => setState({ loading: false, error: "", data }),
  };
}
