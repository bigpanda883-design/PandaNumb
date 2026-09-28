/**
 * Panda Numbers - transaction store
 * -------------------------------------------------
 * The single source of truth for wallet activity.
 *
 * Both the dashboard's "Recent Transactions" and the full Transactions page read
 * from here, so a deposit or purchase immediately appears in both, and a
 * brand-new account correctly starts empty (nothing is ever seeded).
 *
 * TODO(api): when the backend exists, these records should be hydrated from
 * GET /api/transactions instead of being appended locally. The record shape
 * below is the contract the UI already expects.
 */

const TRANSACTIONS_STORAGE_KEY = "panda-numbers-transactions";

export const TRANSACTION_TYPES = {
  DEPOSIT: "deposit",
  PURCHASE: "purchase",
  WITHDRAWAL: "withdrawal",
  TRANSFER: "transfer",
  REFUND: "refund",
};

export const TRANSACTION_STATUS = {
  SUCCESSFUL: "SUCCESSFUL",
  PENDING: "PENDING",
  FAILED: "FAILED",
};

export function getTransactions() {
  try {
    const raw = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTransactions(transactions) {
  try {
    localStorage.setItem(
      TRANSACTIONS_STORAGE_KEY,
      JSON.stringify(transactions),
    );
  } catch {
    // Storage unavailable - React state still reflects the change this session.
  }
  window.dispatchEvent(new CustomEvent("panda-transactions-change"));
}

/**
 * Record a wallet activity.
 *
 * @param {object} tx
 * @param {string} tx.type      one of TRANSACTION_TYPES
 * @param {string} tx.title     human-readable summary
 * @param {number} tx.amount    signed naira amount (positive = credit)
 * @param {string} [tx.status]  defaults to SUCCESSFUL
 * @param {string} [tx.path]    where the row should link to
 * @param {string} [tx.reference] backend reference/order id when available
 */
export function addTransaction({
  type,
  title,
  amount,
  status = TRANSACTION_STATUS.SUCCESSFUL,
  path,
  reference,
  date = new Date(),
}) {
  if (!type || !title) return null;

  const dateStr = `${date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;

  const transaction = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title,
    amount,
    status,
    path,
    reference,
    date: dateStr,
    createdAt: date.getTime(),
  };

  // Newest first, matching both list UIs.
  writeTransactions([transaction, ...getTransactions()]);
  return transaction;
}

/** Replace the whole history, e.g. after loading it from the API. */
export function setTransactions(transactions) {
  if (!Array.isArray(transactions)) return;
  writeTransactions(transactions);
}

export function clearTransactions() {
  writeTransactions([]);
}

export function subscribeToTransactions(callback) {
  const handler = () => callback(getTransactions());
  window.addEventListener("panda-transactions-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("panda-transactions-change", handler);
    window.removeEventListener("storage", handler);
  };
}
