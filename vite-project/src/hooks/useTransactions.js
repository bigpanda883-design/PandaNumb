import { useEffect, useState } from "react";
import { getAuthToken } from "../auth/authStorage";
import { getApiBaseUrl, readJson } from "../services/httpClient";
import {
  getTransactions,
  setTransactions as saveTransactions,
  subscribeToTransactions,
} from "../wallet/transactionStore";

/**
 * Read the real wallet history from the backend.
 *
 * Returns null when there is nothing to apply (signed out, backend down, an
 * unexpected body), so the caller keeps the local history instead of blanking
 * the page.
 */
async function fetchTransactionsFromApi({ signal } = {}) {
  const token = getAuthToken();
  if (!token) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/transactions`, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;

  const { data, parsed } = await readJson(response);
  if (!parsed || data === null) return null;

  return Array.isArray(data?.transactions) ? data.transactions : null;
}

/**
 * Live view of the transaction history, shared by the dashboard and the page.
 *
 * Seeded from the local store so the list paints immediately, then refreshed
 * from GET /api/transactions. Without that refresh, history recorded on another
 * device (or a deposit confirmed server-side) never appeared here and the local
 * copy was the only history the user ever saw. A failed request keeps the local
 * copy instead of emptying the page.
 */
export function useTransactions() {
  const [transactions, setTransactions] = useState(getTransactions);

  useEffect(() => {
    // `useState` above already seeded from the store, so re-reading it here would
    // only cause an extra render. Just subscribe to later changes.
    const unsubscribe = subscribeToTransactions(setTransactions);

    const controller = new AbortController();
    fetchTransactionsFromApi({ signal: controller.signal })
      .then((remote) => {
        // The store write fires "panda-transactions-change", which re-renders
        // every subscriber (and persists the history for the next page load).
        if (remote) saveTransactions(remote);
      })
      .catch(() => {
        // Offline / signed out / backend down: keep the local history.
      });

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, []);

  return transactions;
}
