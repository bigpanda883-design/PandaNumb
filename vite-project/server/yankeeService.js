const API_KEY = process.env.YANKEE_API_KEY || process.env.YANKEE_VERIFY_API_KEY;
const BASE_URL =
  process.env.YANKEE_API_BASE_URL ||
  process.env.YANKEE_VERIFY_BASE_URL ||
  "https://yankee-verify-api.onrender.com/api/v1/handler_api.php";

function getYankeeApiKey() {
  return API_KEY || "";
}

function getYankeeBaseUrl() {
  return BASE_URL;
}

async function callYankee(action, params = {}, { signal } = {}) {
  const apiKey = getYankeeApiKey();
  if (!apiKey) {
    const error = new Error("PROVIDER_NOT_CONFIGURED");
    error.code = "PROVIDER_NOT_CONFIGURED";
    throw error;
  }

  const url = new URL(getYankeeBaseUrl());
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  const abortListener = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortListener, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = (await response.text()).trim();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("PROVIDER_TIMEOUT");
      timeoutError.name = "TimeoutError";
      timeoutError.code = "PROVIDER_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", abortListener);
    }
  }
}

export function getYankeeBalance() {
  return callYankee("getBalance")
    .then(({ ok, status, text }) => {
      if (!ok) {
        const error = new Error("PROVIDER_HTTP_ERROR");
        error.code = "PROVIDER_HTTP_ERROR";
        error.status = status;
        throw error;
      }

      const response = String(text || "").trim();
      const match = /^ACCESS_BALANCE:(.+)$/i.exec(response);
      if (!match) {
        const error = new Error(response || "BAD_RESPONSE");
        error.code = response || "BAD_RESPONSE";
        throw error;
      }

      const value = Number(match[1]);
      if (!Number.isFinite(value)) {
        const error = new Error("BAD_RESPONSE");
        error.code = "BAD_RESPONSE";
        throw error;
      }

      return value;
    })
    .catch((error) => {
      if (error?.code === "PROVIDER_NOT_CONFIGURED") throw error;
      if (error?.message === "PROVIDER_TIMEOUT") throw error;
      throw error;
    });
}

export function getYankeeNumbersStatus(country) {
  return callYankee("getNumbersStatus", { country }).then(
    ({ ok, status, text }) => {
      if (!ok) {
        const error = new Error("PROVIDER_HTTP_ERROR");
        error.code = "PROVIDER_HTTP_ERROR";
        error.status = status;
        throw error;
      }

      if (!text) {
        return {};
      }

      if (text === "ERROR" || text === "NO_NUMBERS") {
        return {};
      }

      try {
        const data = JSON.parse(text);
        return data && typeof data === "object" && !Array.isArray(data)
          ? data
          : {};
      } catch {
        return {};
      }
    },
  );
}

export function requestYankeeNumber(service, country, maxPrice) {
  return callYankee("getNumber", { service, country, maxPrice }).then(
    ({ ok, status, text }) => {
      if (!ok) {
        const error = new Error("PROVIDER_HTTP_ERROR");
        error.code = "PROVIDER_HTTP_ERROR";
        error.status = status;
        throw error;
      }

      const part = String(text || "").trim();
      const match = /^ACCESS_NUMBER:([^:]+):(.+)$/i.exec(part);
      if (!match) {
        const error = new Error(part || "BAD_RESPONSE");
        error.code = part || "BAD_RESPONSE";
        throw error;
      }

      return {
        activationId: match[1],
        phone: match[2],
      };
    },
  );
}

export function getYankeeActivationStatus(activationId) {
  return callYankee("getStatus", { id: activationId }).then(
    ({ ok, status, text }) => {
      if (!ok) {
        const error = new Error("PROVIDER_HTTP_ERROR");
        error.code = "PROVIDER_HTTP_ERROR";
        error.status = status;
        throw error;
      }

      const raw = String(text || "").trim();
      const parts = raw.split(":");
      if (parts[0] === "STATUS_WAIT_CODE")
        return { status: "WAITING", code: null };
      if (parts[0] === "STATUS_OK")
        return {
          status: "CODE_RECEIVED",
          code: parts.slice(1).join(":") || null,
        };
      if (parts[0] === "STATUS_CANCEL")
        return { status: "CANCELLED", code: null };

      return { status: raw || "UNKNOWN", code: null };
    },
  );
}

export function setYankeeActivationStatus(activationId, status) {
  return callYankee("setStatus", { id: activationId, status }).then(
    ({ ok, status: httpStatus, text }) => {
      if (!ok) {
        const error = new Error("PROVIDER_HTTP_ERROR");
        error.code = "PROVIDER_HTTP_ERROR";
        error.status = httpStatus;
        throw error;
      }

      return String(text || "").trim();
    },
  );
}

export const YANKEE_SERVICE_MAP = {
  whatsapp: { displayName: "WhatsApp", yankeeService: "wa" },
  telegram: { displayName: "Telegram", yankeeService: "tg" },
  facebook: { displayName: "Facebook", yankeeService: "fb" },
  instagram: { displayName: "Instagram", yankeeService: "ig" },
};

export const YANKEE_COUNTRY_MAP = {
  nigeria: "NG",
  canada: "CA",
  unitedstates: "US",
  unitedkingdom: "GB",
  ghana: "GH",
};

export { getYankeeApiKey, getYankeeBaseUrl };
