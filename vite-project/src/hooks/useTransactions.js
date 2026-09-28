import { useEffect, useState } from "react";
import {
  getTransactions,
  subscribeToTransactions,
} from "../wallet/transactionStore";

/** Live view of the transaction history, shared by the dashboard and the page. */
export function useTransactions() {
  const [transactions, setTransactions] = useState(getTransactions);

  useEffect(() => {
    // `useState` above already seeded from the store, so re-reading it here would
    // only cause an extra render. Just subscribe to later changes.
    return subscribeToTransactions(setTransactions);
  }, []);

  return transactions;
}
