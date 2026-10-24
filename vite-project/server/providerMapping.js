import { YANKEE_COUNTRY_MAP } from "./yankeeService.js";

/**
 * Panda Numbers - provider service mapping
 * ========================================
 * The Buy catalogue is keyed by ACC Numbers service ids (e.g. "whatsapp",
 * "3fun"), but the number provider (Yankee Verify) issues numbers under its OWN
 * service codes. This module is the single place that bridges the two.
 *
 * VERIFIED against the live provider via the getNumbersStatus payload
 * (GET .../handler_api.php?action=getNumbersStatus&country=US), which keys
 * services as "whatsapp_0", "telegram_0", etc. The provider therefore expects
 * the service NAME ("whatsapp"), not a short code ("wa"). Using "wa" returns
 * NO_NUMBERS even when stock exists, which looks exactly like "out of stock".
 *
 * IMPORTANT: a mapping is only used when it is unambiguous. When we do NOT know
 * the provider's code for a service we return null, and the caller MUST refuse
 * the purchase rather than guess. Guessing here would send the wrong service code
 * to the provider and hand the user a number for a service they did not ask for.
 */

/**
 * Provider codes, verified against the LIVE provider (getNumbersStatus for US,
 * CA and NG, and one getNumber probe per service).
 *
 * Two facts decide the mapping:
 *   - a service the provider LISTS answers NO_BALANCE (it would issue a number
 *     if the account had credit), while an unknown or unstocked one answers
 *     NO_NUMBERS. That difference is what confirms a code.
 *   - `getNumber` takes the BASE code ("facebook"), not the stock key
 *     ("facebook_0").
 *
 * An unmapped service returns null and the purchase is refused, because a
 * guessed code would return NO_NUMBERS forever and look like "out of stock".
 *
 * PROVIDER_SPELLING holds the few codes the provider spell differently from the
 * catalogue; everything else is the catalogue id itself.
 */
const PROVIDER_SPELLING = {
  twitter: "x", // the provider lists "x_0", not "twitter"
  x: "x",
  paypal: "paypal_du",
  gmail: "google", // a Gmail sign-up takes a Google number
  whatsapp_other: "whatsapp", // second WhatsApp product, same service
};

/** Services confirmed by a NO_BALANCE answer from getNumber. */
export const YANKEE_VERIFIED_CODES = new Set(
  `telegram facebook google whatsapp instagram snapchat tiktok discord linkedin
   x signal viber wechat yahoo microsoft amazon apple uber netflix other botim`
    .split(/\s+/)
    .filter(Boolean),
);

/** Brand labels for the codes above (the Buy page otherwise prettifies the id). */
const DISPLAY_NAMES = {
  whatsapp: "WhatsApp",
  whatsapp_other: "WhatsApp (other option)",
  telegram: "Telegram",
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google",
  gmail: "Gmail",
  googlevoice: "Google Voice",
  x: "X (Twitter)",
  twitter: "X (Twitter)",
  paypal: "PayPal",
  other: "Other services",
  microsoft: "Microsoft",
  yahoo: "Yahoo",
  tiktok: "TikTok",
  snapchat: "Snapchat",
};

function providerCodeFor(id) {
  const key = String(id || "").trim();
  if (!key) return "";
  return PROVIDER_SPELLING[key] || PROVIDER_SPELLING[key.toLowerCase()] || key;
}

function displayNameFor(id, providerCode) {
  return (
    DISPLAY_NAMES[id] ||
    DISPLAY_NAMES[String(id).toLowerCase()] ||
    prettifyId(providerCode)
  );
}

function prettifyId(id) {
  return String(id || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word.toLowerCase(),
    )
    .join(" ");
}

/**
 * Legacy short-code aliases. These are what older clients sent ("wa", "tg");
 * the provider does NOT accept them, so they are translated - never forwarded.
 */
export const YANKEE_SERVICE_MAP = {
  wa: { displayName: "WhatsApp", yankeeService: "whatsapp" },
  tg: { displayName: "Telegram", yankeeService: "telegram" },
  fb: { displayName: "Facebook", yankeeService: "facebook" },
  ig: { displayName: "Instagram", yankeeService: "instagram" },
  instagram: { displayName: "Instagram", yankeeService: "instagram" },
  messenger: { displayName: "Messenger", yankeeService: "facebook" },
  bigolive: { displayName: "Bigo Live", yankeeService: "bigolive" },
  aol: { displayName: "AOL", yankeeService: "aol" },
  protonmail: { displayName: "Proton Mail", yankeeService: "protonmail" },
  tinder: { displayName: "Tinder", yankeeService: "tinder" },
  bumble: { displayName: "Bumble", yankeeService: "bumble" },
  hinge: { displayName: "Hinge", yankeeService: "hinge" },
  badoo: { displayName: "Badoo", yankeeService: "badoo" },
  happn: { displayName: "Happn", yankeeService: "happn" },
  grindr: { displayName: "Grindr", yankeeService: "grindr" },
  hily: { displayName: "Hily", yankeeService: "hily" },
  skout: { displayName: "Skout", yankeeService: "skout" },
  tango: { displayName: "Tango", yankeeService: "tango" },
  pof: { displayName: "Plenty of Fish", yankeeService: "pof" },
  ebay: { displayName: "eBay", yankeeService: "ebay" },
  etsy: { displayName: "Etsy", yankeeService: "etsy" },
  walmart: { displayName: "Walmart", yankeeService: "walmart" },
  temu: { displayName: "Temu", yankeeService: "temu" },
  shein: { displayName: "Shein", yankeeService: "shein" },
  shopee: { displayName: "Shopee", yankeeService: "shopee" },
  lazada: { displayName: "Lazada", yankeeService: "lazada" },
  flipkart: { displayName: "Flipkart", yankeeService: "flipkart" },
  taobao: { displayName: "Taobao", yankeeService: "taobao" },
  shopify: { displayName: "Shopify", yankeeService: "shopify" },
  aliexpress: { displayName: "AliExpress", yankeeService: "aliexpress" },
  alibaba: { displayName: "Alibaba", yankeeService: "alibaba" },
  airbnb: { displayName: "Airbnb", yankeeService: "airbnb" },
  lyft: { displayName: "Lyft", yankeeService: "lyft" },
  bolt: { displayName: "Bolt", yankeeService: "bolt" },
  didi: { displayName: "Di", yankeeService: "didi" },
  glovo: { displayName: "Glovo", yankeeService: "glovo" },
  wolt: { displayName: "Wolt", yankeeService: "wolt" },
  deliveroo: { displayName: "Deliveroo", yankeeService: "deliveroo" },
  doordash: { displayName: "DoorDash", yankeeService: "doordash" },
  swiggy: { displayName: "Swiggy", yankeeService: "swiggy" },
  foodpanda: { displayName: "foodpanda", yankeeService: "foodpanda" },
  careem: { displayName: "Careem", yankeeService: "careem" },
  grabtaxi: { displayName: "Grab", yankeeService: "grab" },
  steam: { displayName: "Steam", yankeeService: "steam" },
  twilio: { displayName: "Twilio", yankeeService: "twilio" },
  upwork: { displayName: "Upwork", yankeeService: "upwork" },
  fiverr: { displayName: "Fiverr", yankeeService: "fiverr" },
  // The provider keys these by the brand's own spelling ("GitHub_0").
  github: { displayName: "GitHub", yankeeService: "GitHub" },
  zoom: { displayName: "Zoom", yankeeService: "zoom" },
  zoho: { displayName: "Zoho", yankeeService: "zoho" },
  vercel: { displayName: "Vercel", yankeeService: "vercel" },
  vinted: { displayName: "Vinted", yankeeService: "vinted" },
  depop: { displayName: "Depop", yankeeService: "depop" },
  poshmark: { displayName: "Poshmark", yankeeService: "poshmark" },
  instacart: { displayName: "Instacart", yankeeService: "instacart" },
  truecaller: { displayName: "Truecaller", yankeeService: "truecaller" },
  "7eleven": { displayName: "7-Eleven", yankeeService: "7eleven" },
  adobe: { displayName: "Adobe", yankeeService: "adobe" },
  airtel: { displayName: "Airtel", yankeeService: "airtel" },
  ashleymadison: { displayName: "Ashley Madison", yankeeService: "ashleymadison" },
  attapoll: { displayName: "AttaPoll", yankeeService: "attapoll" },
  botim: { displayName: "Botim", yankeeService: "botim" },
  bilibili: { displayName: "Bilibili", yankeeService: "bilibili" },
  bingostars: { displayName: "Bingo Stars", yankeeService: "bingostars" },
  bitclout: { displayName: "BitClout", yankeeService: "bitclout" },
  blablacar: { displayName: "BlaBlaCar", yankeeService: "blablacar" },
  carousell: { displayName: "Carousell", yankeeService: "carousell" },
  chargepoint: { displayName: "ChargePoint", yankeeService: "chargepoint" },
  cleartrip: { displayName: "Cleartrip", yankeeService: "cleartrip" },
  cloudbet: { displayName: "Cloudbet", yankeeService: "cloudbet" },
  cocacola: { displayName: "Coca-Cola", yankeeService: "cocacola" },
  craigslist: { displayName: "Craigslist", yankeeService: "craigslist" },
  fedex: { displayName: "FedEx", yankeeService: "fedex" },
  feeld: { displayName: "Feeld", yankeeService: "feeld" },
  flip: { displayName: "Flip", yankeeService: "flip" },
  foodora: { displayName: "Foodora", yankeeService: "foodora" },
  freenow: { displayName: "FreeNow", yankeeService: "freenow" },
  gemini: { displayName: "Gemini", yankeeService: "gemini" },
  getir: { displayName: "Getir", yankeeService: "getir" },
  gett: { displayName: "Gett", yankeeService: "gett" },
  grailed: { displayName: "Grailed", yankeeService: "grailed" },
  haraj: { displayName: "Haraj", yankeeService: "haraj" },
  hopp: { displayName: "Hopp", yankeeService: "hopp" },
  idealista: { displayName: "Idealista", yankeeService: "idealista" },
  indeed: { displayName: "Indeed", yankeeService: "indeed" },
  ipsosisay: { displayName: "Ipsos iSay", yankeeService: "ipsosisay" },
  justdating: { displayName: "JustDating", yankeeService: "justdating" },
  kaggle: { displayName: "Kaggle", yankeeService: "kaggle" },
  likee: { displayName: "Likee", yankeeService: "likee" },
  manus: { displayName: "Manus", yankeeService: "manus" },
  match: { displayName: "Match", yankeeService: "match" },
  michat: { displayName: "MiChat", yankeeService: "michat" },
  mocospace: { displayName: "MocoSpace", yankeeService: "mocospace" },
  my11circle: { displayName: "My11Circle", yankeeService: "my11circle" },
  myntra: { displayName: "Myntra", yankeeService: "myntra" },
  ncsoft: { displayName: "NCSoft", yankeeService: "ncsoft" },
  naver: { displayName: "Naver", yankeeService: "naver" },
  nextdoor: { displayName: "Nextdoor", yankeeService: "nextdoor" },
  nike: { displayName: "Nike", yankeeService: "nike" },
  nobroker: { displayName: "NoBroker", yankeeService: "nobroker" },
  oppo: { displayName: "Oppo", yankeeService: "oppo" },
  offgamers: { displayName: "OffGamers", yankeeService: "offgamers" },
  // ACC's own "other" bucket is a mixed list of services, so it keeps a
  // neutral name rather than being sold under a made-up brand.
  other: { displayName: "Other services", yankeeService: "other" },
  pinduoduo: { displayName: "Pinduoduo", yankeeService: "pinduoduo" },
  rapido: { displayName: "Rapido", yankeeService: "rapido" },
  rappi: { displayName: "Rappi", yankeeService: "rappi" },
  razer: { displayName: "Razer", yankeeService: "razer" },
  rebtel: { displayName: "Rebtel", yankeeService: "rebtel" },
  redbubble: { displayName: "Redbubble", yankeeService: "redbubble" },
  roblox: { displayName: "Roblox", yankeeService: "roblox" },
  rummygold: { displayName: "Rummy Gold", yankeeService: "rummygold" },
  rummyloot: { displayName: "Rummy Loot", yankeeService: "rummyloot" },
  signalhire: { displayName: "SignalHire", yankeeService: "signalhire" },
  smitten: { displayName: "Smitten", yankeeService: "smitten" },
  subito: { displayName: "Subito", yankeeService: "subito" },
  supercom: { displayName: "Super.com", yankeeService: "supercom" },
  talabat: { displayName: "Talabat", yankeeService: "talabat" },
  tencentqq: { displayName: "Tencent QQ", yankeeService: "tencentqq" },
  ticketmaster: { displayName: "Ticketmaster", yankeeService: "ticketmaster" },
  trendyol: { displayName: "Trendyol", yankeeService: "trendyol" },
  truthsocial: { displayName: "Truth Social", yankeeService: "truthsocial" },
  ubisoft: { displayName: "Ubisoft", yankeeService: "ubisoft" },
  uklon: { displayName: "Uklon", yankeeService: "uklon" },
  upward: { displayName: "Upward", yankeeService: "upward" },
  whatnot: { displayName: "Whatnot", yankeeService: "whatnot" },
  yalla: { displayName: "Yalla", yankeeService: "yalla" },
  yikyak: { displayName: "Yik Yak", yankeeService: "yikyak" },
  iplum: { displayName: "iPlum", yankeeService: "iplum" },
  kimi: { displayName: "Kimi", yankeeService: "kimi" },
  nvidia: { displayName: "NVIDIA", yankeeService: "nvidia" },
  perplexity: { displayName: "Perplexity", yankeeService: "perplexity" },
  polymarket: { displayName: "Polymarket", yankeeService: "polymarket" },
  seated: { displayName: "Seated", yankeeService: "seated" },
  triumph: { displayName: "Triumph", yankeeService: "triumph" },
};

/**
 * Resolve the provider's service code for a catalogue card id.
 *
 *   1. A legacy alias ("wa") is translated.
 *   2. A catalogue VARIANT id ("instagram_virtual34") is truncated to its
 *      service. Only the variant suffix is removed (provider codes may contain
 *      "_du", "_co" or "_sm"), and a multi-word id such as "whatsapp_other" is
 *      kept intact.
 *   3. Anything else is sent as the catalogue id itself, with the few provider
 *      spellings corrected by PROVIDER_SPELLING ("twitter" -> "x").
 *
 * @param {string} serviceId catalogue card id, e.g. "whatsapp" or
 *                           "whatsapp_virtual34"
 * @returns {{providerService:string, displayName:string, verified:boolean}|null}
 *          null only when there is no id at all - a card that is not sellable is
 *          refused earlier by server/pricing.js, not by a guess here.
 */
export function resolveProviderService(serviceId) {
  if (!serviceId) return null;

  const key = String(serviceId).trim();
  const lower = key.toLowerCase();

  const alias = YANKEE_SERVICE_MAP[key] || YANKEE_SERVICE_MAP[lower];
  if (alias) {
    return {
      providerService: alias.yankeeService,
      displayName: alias.displayName,
      verified: YANKEE_VERIFIED_CODES.has(alias.yankeeService),
    };
  }

  // `instagram_virtual34` -> `instagram`; `whatsapp_other` stays whole.
  const baseId = key.replace(/_(virtual\d*|\d+)$/i, "");
  const providerService = providerCodeFor(baseId);

  return {
    providerService,
    displayName: displayNameFor(baseId, providerService),
    // false = the provider lists it but we have not probed it, so a purchase may
    // still answer NO_NUMBERS. The Buy page already says "live inventory".
    verified: YANKEE_VERIFIED_CODES.has(String(providerService).toLowerCase()),
  };
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
