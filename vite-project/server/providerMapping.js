/**
 * Panda Numbers - provider service mapping
 * ========================================
 * The Buy catalogue is keyed by ACC Numbers service ids (e.g. "whatsapp",
 * "3fun"), but the number provider (Yankee Verify) issues numbers under its OWN
 * service codes (e.g. "wa", "tg"). This module is the single place that bridges
 * the two.
 *
 * IMPORTANT: a mapping is only used when it is unambiguous. When we do NOT know
 * the provider's code for a service we return null, and the caller MUST refuse
 * the purchase rather than guess. Guessing here would send the wrong service code
 * to the provider and hand the user a number for a service they did not ask for.
 */

/** Provider codes we are confident about (verified against the provider docs). */
export const YANKEE_SERVICE_MAP = {
  whatsapp: { displayName: "WhatsApp", yankeeService: "wa" },
  telegram: { displayName: "Telegram", yankeeService: "tg" },
  facebook: { displayName: "Facebook", yankeeService: "fb" },
  instagram: { displayName: "Instagram", yankeeService: "ig" },
  // Common aliases the catalogue may use for the same brands.
  wa: { displayName: "WhatsApp", yankeeService: "wa" },
  tg: { displayName: "Telegram", yankeeService: "tg" },
  fb: { displayName: "Facebook", yankeeService: "fb" },
  ig: { displayName: "Instagram", yankeeService: "ig" },
  messenger: { displayName: "Messenger", yankeeService: "fb" },
  google: { displayName: "Google", yankeeService: "go" },
  gmail: { displayName: "Gmail", yankeeService: "go" },
  twitter: { displayName: "X (Twitter)", yankeeService: "tw" },
  tiktok: { displayName: "TikTok", yankeeService: "tt" },
  discord: { displayName: "Discord", yankeeService: "ds" },
  apple: { displayName: "Apple", yankeeService: "ap" },
  amazon: { displayName: "Amazon", yankeeService: "am" },
  netflix: { displayName: "Netflix", yankeeService: "nf" },
  microsoft: { displayName: "Microsoft", yankeeService: "ms" },
  uber: { displayName: "Uber", yankeeService: "ub" },
  snapchat: { displayName: "Snapchat", yankeeService: "sc" },
  yahoo: { displayName: "Yahoo", yankeeService: "yh" },
  paypal: { displayName: "PayPal", yankeeService: "pp" },
};

/**
 * Resolve the provider's service code for a catalogue service id.
 *
 * @param {string} serviceId  catalogue id, e.g. "whatsapp" or a catalogue
 *                            variant id such as "whatsapp_virtual34"
 * @returns {{providerService:string, displayName:string}|null}
 *          null when the mapping is unknown - the caller must reject the purchase.
 */
export function resolveProviderService(serviceId) {
  if (!serviceId) return null;

  const key = String(serviceId).trim().toLowerCase();

  const direct = YANKEE_SERVICE_MAP[key];
  if (direct)
    return {
      providerService: direct.yankeeService,
      displayName: direct.displayName,
    };

  // `whatsapp_virtual34` -> `whatsapp`. Only a trailing VARIANT is stripped; a
  // bare service name is handled by the lookup above.
  const base = key.split(/[_:]/)[0];
  const mapped = YANKEE_SERVICE_MAP[base];
  if (mapped)
    return {
      providerService: mapped.yankeeService,
      displayName: mapped.displayName,
    };

  return null;
}

/**
 * Alpha-2 codes for the catalogue's own country names/aliases.
 *
 * The Buy page already resolves this from src/config/countryCatalog.js and sends
 * the ISO-2 code as `countryCode`, so a normal purchase needs nothing here. This
 * is the fallback for a caller that instead passes the catalogue slug (e.g. the
 * raw "usa" key), which the provider would reject.
 */
const ISO_BY_CATALOGUE_SLUG = {
  usa: "US",
  uk: "GB",
  england: "GB",
  uae: "AE",
  drc: "CD",
  congo: "CG",
  southkorea: "KR",
  northkorea: "KP",
  czechia: "CZ",
  ivorycoast: "CI",
};

/**
 * Resolve the provider's country identifier (ISO-2) from whatever the caller has.
 * A value that is already ISO-2 is returned upper-cased; anything unrecognised
 * is returned as-is so the provider - not a guess - decides whether it is valid.
 */
export function resolveProviderCountry(country) {
  const value = String(country || "").trim();
  if (!value) return "";

  const key = value.toLowerCase().replace(/[^a-z]/g, "");
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();

  if (ISO_BY_CATALOGUE_SLUG[key]) return ISO_BY_CATALOGUE_SLUG[key];
  if (YANKEE_COUNTRY_MAP[key]) return YANKEE_COUNTRY_MAP[key];

  return value;
}

export default {
  YANKEE_SERVICE_MAP,
  YANKEE_COUNTRY_MAP,
  resolveProviderService,
  resolveProviderCountry,
};
