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
 * @param {string} serviceId  catalogue id, e.g. "whatsapp" or "whatsapp_virtual8"
 * @returns {{providerService:string, displayName:string}|null}
 *          null when the mapping is unknown - the caller must reject the purchase.
 */
export function resolveProviderService(serviceId) {
  if (!serviceId) return null;

  const key = String(serviceId).trim().toLowerCase();

  // The catalogue sometimes hands us a composite id ("whatsapp_virtual8"); the
  // service name is the part before the first separator.
  const base = key.split(/[_:]/)[0];

  const direct = YANKEE_SERVICE_MAP[key];
  if (direct)
    return {
      providerService: direct.yankeeService,
      displayName: direct.displayName,
    };

  const mapped = YANKEE_SERVICE_MAP[base];
  if (mapped)
    return {
      providerService: mapped.yankeeService,
      displayName: mapped.displayName,
    };

  return null;
}

export default { YANKEE_SERVICE_MAP, resolveProviderService };
