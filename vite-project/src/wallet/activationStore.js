const ACTIVATIONS_STORAGE_KEY = "panda-numbers-activations";

/** Lifecycle of an activation, mirroring the provider's own statuses. */
export const NUMBER_STATUS = {
  WAITING: "WAITING",
  CODE_RECEIVED: "CODE_RECEIVED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

export function getActivations() {
  try {
    const raw = localStorage.getItem(ACTIVATIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(activations) {
  try {
    localStorage.setItem(ACTIVATIONS_STORAGE_KEY, JSON.stringify(activations));
  } catch {
    // Non-fatal; in-memory state still updates.
  }
  window.dispatchEvent(new CustomEvent("panda-activations-change"));
}

/**
 * Record a number the provider just issued.
 *
 * @param {object} activation
 * @param {string} activation.activationId  provider id (getStatus/setStatus key)
 * @param {string} activation.phone         the real number from the provider
 * @param {string} activation.service       service id used for the request
 * @param {string} activation.country       country code used for the request
 * @param {number} [activation.price]       what the user paid
 */
export function addActivation({
  activationId,
  phone,
  service,
  country,
  price,
  // Values the My Numbers list renders directly. Kept on the stored record so
  // the list never has to guess: `phone`/`country` are what the provider call
  // used, while `number`/`countryCode`/`countryName` are what the UI displays.
  number,
  countryCode,
  countryName,
  orderId,
  status = NUMBER_STATUS.WAITING,
}) {
  if (!activationId || !phone) return null;

  const now = new Date();
  const displayPhone = number || phone;
  const displayCountryCode = String(countryCode || country || "").toLowerCase();
  const activation = {
    activationId,
    // `id` mirrors activationId so a record coming from either the local store
    // or GET /api/numbers has the same shape when the list renders it.
    id: activationId,
    phone,
    number: displayPhone,
    country,
    countryCode: displayCountryCode,
    countryName: countryName || String(country || "").toUpperCase(),
    service,
    price,
    orderId: orderId || activationId,
    status,
    code: null,
    receivedAt: null,
    createdAt: now.getTime(),
    dateStr: `${now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}, ${now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`,
  };

  write([activation, ...getActivations()]);
  return activation;
}

export function getActivation(activationId) {
  return getActivations().find((a) => a.activationId === activationId) ?? null;
}

/** Attach the provider's code to its activation. */
export function recordCode(activationId, code, receivedAt = new Date()) {
  write(
    getActivations().map((a) =>
      a.activationId === activationId
        ? {
            ...a,
            code,
            status: NUMBER_STATUS.CODE_RECEIVED,
            receivedAt: receivedAt.toISOString(),
          }
        : a,
    ),
  );
}

export function updateActivationStatus(activationId, status) {
  write(
    getActivations().map((a) =>
      a.activationId === activationId ? { ...a, status } : a,
    ),
  );
}

export function clearActivations() {
  write([]);
}

export function subscribeToActivations(callback) {
  const handler = () => callback(getActivations());
  window.addEventListener("panda-activations-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("panda-activations-change", handler);
    window.removeEventListener("storage", handler);
  };
}
