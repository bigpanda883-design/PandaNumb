/**
 * Panda Numbers - selling price catalogue
 * =======================================
 *
 * The ACC Numbers catalogue (the /api/prices upstream) gives one number per
 * service/country/variant: the provider's COST in naira. It gives no selling
 * price, and most of its 1,630 service ids are not sold by Yankee Verify (our
 * number provider). This module is the single place that decides what a
 * customer is charged:
 *
 *   provider cost   <- the ACC catalogue (never edited here)
 *   selling price   <- this module (fixed price, or cost + markup, per tier)
 *   profit          <- selling price - cost - fee
 *
 * Two price modes exist per tier:
 *
 *   "fixed"   a flat price inside a floor/ceiling window (e.g. Gmail ₦500,
 *             kept within ₦450-₦700 where the provider cost allows). Above
 *             the ceiling the price steps up to stay profitable: Gmail in the
 *             US costs ₦980, so a flat ₦700 would sell at a loss.
 *
 *   "margin"  price = cost + markupPercent, except a `base` becomes the
 *             default while it is already profitable (WhatsApp / Telegram
 *             fresh: "₦2,500, or cost + 40% when that is higher").
 *
 * Every function is pure - nothing is cached - so the purchase route and the
 * /api/prices response always compute the same figure, and a price change via
 * the environment applies on the next request.
 */

/** Every supported service is priced by exactly one of these tiers. */
export const PRICE_TIERS = {
  google: { label: "Google", mode: "fixed", base: 500, min: 450, max: 700 },
  gmail: { label: "Gmail", mode: "fixed", base: 500, min: 450, max: 700 },
  telegram_fresh: {
    label: "Telegram fresh / new",
    mode: "margin",
    base: 2200,
    markupPercent: 40,
    min: 800,
    max: 12000,
    minProfit: 50,
  },
  telegram_old: {
    label: "Telegram old / open",
    mode: "margin",
    base: 6200,
    markupPercent: 40,
    min: 800,
    max: 20000,
    // Never sold from a fresh cost. Until a real old/open product is available
    // (see SELLABLE_SERVICES.telegram) any Telegram variant priced here is
    // flagged instead of being sold as something it is not.
    minProfit: 4000,
  },
  whatsapp_other_countries: {
    label: "WhatsApp (other countries)",
    mode: "margin",
    base: 2500,
    markupPercent: 40,
    min: 600,
    max: 20000,
  },
  whatsapp_other: {
    label: "WhatsApp (other option)",
    mode: "margin",
    base: 3000,
    markupPercent: 40,
    min: 600,
    max: 20000,
  },
  facebook: { label: "Facebook", mode: "fixed", base: 500, min: 500, max: 800 },
  instagram: {
    label: "Instagram",
    mode: "fixed",
    base: 500,
    min: 500,
    max: 800,
  },
  other_social: {
    label: "Other social media",
    mode: "fixed",
    base: 500,
    min: 500,
    max: 1000,
  },
  other_email: {
    label: "Other email services",
    mode: "fixed",
    base: 450,
    min: 450,
    max: 700,
  },
  /** Fallback tier; only used when NUMBER_ALLOW_OTHER_TIER=true. */
  other: {
    label: "Other service",
    mode: "fixed",
    base: 500,
    min: 500,
    max: 1000,
  },
};

/**
 * Services that are NOT sold, with the reason shown on the Buy page.
 *
 * ACC lists thousands of ids; Yankee Verify only issues the services in its own
 * stock payload. The ones below ARE issued by the provider but cannot be sold
 * at a price that covers the provider cost, so they are blocked by name rather
 * than silently left without a price.
 */
export const BLOCKED_SERVICES = {
  baidu: {
    reason:
      "Baidu is not sold directly. Buy the Google option instead - it works for the same sign-up.",
  },
  faceit: {
    reason:
      "FACEIT is not sold: the provider cost is higher than the price we can charge.",
  },
  huya: {
    reason:
      "Huya is not sold directly. Buy the Google option instead - it works for the same sign-up.",
  },
  xiaomi: {
    reason:
      "Xiaomi is not sold directly. Buy a Google number instead - it works for the same account.",
  },
};

/**
 * Which tier a catalogue service id belongs to and which provider (Yankee
 * Verify) service code issues it.
 *
 * `variants` maps a catalogue variant suffix to its own tier. Telegram has two
 * documented products (virtual34 = fresh/new, virtual4 = old/open); WhatsApp
 * and the rest have no such table - see the note on whatsapp_other below.
 */
export const SELLABLE_SERVICES = {
  whatsapp: {
    tier: "whatsapp_other_countries",
    // The second WhatsApp price (₦3,000) lives on this same card. ACC has no
    // separate WhatsApp product and only ONE Telegram/WhatsApp stock key, so a
    // second card would offer the exact number at a different price. Assign a
    // variant to the higher tier with PRICE_WHATSAPP_OTHER_VARIANTS if a distinct
    // product appears.
    pricingTiers: ["whatsapp_other_countries", "whatsapp_other"],
    provider: "whatsapp",
    displayName: "WhatsApp",
  },
  telegram: {
    tier: "telegram_fresh",
    provider: "telegram",
    displayName: "Telegram",
    // The ACC catalogue sells Telegram as several variants per country. Every
    // one of them is the SAME one provider product: there is only one Telegram
    // service code ("telegram") and the provider was probed for the separate
    // "tg" code without success. The variants differ only in provider cost, so
    // they are all sold as fresh/new (₦2,200, or cost + 40% where the local
    // cost is above that).
    //
    // The ₦6,200 old/open product stays configured as telegram_old; attach a
    // variant to it with PRICE_TELEGRAM_OLD_VARIANTS once a distinct old/open
    // product is actually available - it cannot be bought until then, and the
    // pricing code never pretends otherwise.
    variants: {
      virtual34: "telegram_fresh",
      virtual8: "telegram_fresh",
      virtual28: "telegram_fresh",
      virtual51: "telegram_fresh",
      virtual63: "telegram_fresh",
    },
  },
  facebook: {
    tier: "facebook",
    provider: "facebook",
    displayName: "Facebook",
  },
  instagram: {
    tier: "instagram",
    provider: "instagram",
    displayName: "Instagram",
  },
  google: { tier: "google", provider: "google", displayName: "Google" },
  // ACC has no "gmail" service either (0 countries): a Gmail sign-up uses a
  // Google number, exactly like Google Voice, so Gmail is sold from the
  // google_* variants.
  gmail: {
    tier: "gmail",
    provider: "google",
    displayName: "Gmail",
    catalogueService: "google",
  },
  googlevoice: {
    tier: "google",
    provider: "googlevoice",
    displayName: "Google Voice",
  },
  // --- Other social media (₦500-₦1,000) --------------------------------
  tiktok: { tier: "other_social", provider: "tiktok", displayName: "TikTok" },
  snapchat: {
    tier: "other_social",
    provider: "snapchat",
    displayName: "Snapchat",
  },
  discord: { tier: "other_social", provider: "discord", displayName: "Discord" },
  linkedin: {
    tier: "other_social",
    provider: "linkedin",
    displayName: "LinkedIn",
  },
  reddit: { tier: "other_social", provider: "reddit", displayName: "Reddit" },
  twitch: { tier: "other_social", provider: "twitch", displayName: "Twitch" },
  twitter: { tier: "other_social", provider: "x", displayName: "X (Twitter)" },
  signal: { tier: "other_social", provider: "signal", displayName: "Signal" },
  viber: { tier: "other_social", provider: "viber", displayName: "Viber" },
  wechat: { tier: "other_social", provider: "wechat", displayName: "WeChat" },
  weibo: { tier: "other_social", provider: "weibo", displayName: "Weibo" },
  imo: { tier: "other_social", provider: "imo", displayName: "imo" },
  groupme: { tier: "other_social", provider: "groupme", displayName: "GroupMe" },
  kakaotalk: {
    tier: "other_social",
    provider: "kakaotalk",
    displayName: "KakaoTalk",
  },
  zalo: { tier: "other_social", provider: "zalo", displayName: "Zalo" },
  tantan: { tier: "other_social", provider: "tantan", displayName: "Tan" },
  clubhouse: {
    tier: "other_social",
    provider: "clubhouse",
    displayName: "Clubhouse",
  },
  bigolive: {
    tier: "other_social",
    provider: "bigolive",
    displayName: "Bigo Live",
  },
  // --- Other email services (₦450-₦700) --------------------------------
  yahoo: { tier: "other_email", provider: "yahoo", displayName: "Yahoo" },
  aol: { tier: "other_email", provider: "aol", displayName: "AOL" },
  protonmail: {
    tier: "other_email",
    provider: "protonmail",
    displayName: "Proton Mail",
  },
  microsoft: {
    tier: "other_email",
    provider: "microsoft",
    displayName: "Microsoft",
  },
  // --- Everything else the provider issues ------------------------------
  amazon: { tier: "other", provider: "amazon", displayName: "Amazon" },
  apple: { tier: "other", provider: "apple", displayName: "Apple" },
  aliexpress: {
    tier: "other",
    provider: "aliexpress",
    displayName: "AliExpress",
  },
  alibaba: { tier: "other", provider: "alibaba", displayName: "Alibaba" },
  airbnb: { tier: "other", provider: "airbnb", displayName: "Airbnb" },
  badoo: { tier: "other", provider: "badoo", displayName: "Badoo" },
  bumble: { tier: "other", provider: "bumble", displayName: "Bumble" },
  tinder: { tier: "other", provider: "tinder", displayName: "Tinder" },
  hinge: { tier: "other", provider: "hinge", displayName: "Hinge" },
  grindr: { tier: "other", provider: "grindr", displayName: "Grindr" },
  happn: { tier: "other", provider: "happn", displayName: "Happn" },
  hily: { tier: "other", provider: "hily", displayName: "Hily" },
  skout: { tier: "other", provider: "skout", displayName: "Skout" },
  tango: { tier: "other", provider: "tango", displayName: "Tango" },
  netflix: { tier: "other", provider: "netflix", displayName: "Netflix" },
  ebay: { tier: "other", provider: "ebay", displayName: "eBay" },
  etsy: { tier: "other", provider: "etsy", displayName: "Etsy" },
  walmart: { tier: "other", provider: "walmart", displayName: "Walmart" },
  temu: { tier: "other", provider: "temu", displayName: "Temu" },
  shein: { tier: "other", provider: "shein", displayName: "Shein" },
  shopee: { tier: "other", provider: "shopee", displayName: "Shopee" },
  lazada: { tier: "other", provider: "lazada", displayName: "Lazada" },
  flipkart: { tier: "other", provider: "flipkart", displayName: "Flipkart" },
  taobao: { tier: "other", provider: "taobao", displayName: "Taobao" },
  shopify: { tier: "other", provider: "shopify", displayName: "Shopify" },
  uber: { tier: "other", provider: "uber", displayName: "Uber" },
  lyft: { tier: "other", provider: "lyft", displayName: "Lyft" },
  bolt: { tier: "other", provider: "bolt", displayName: "Bolt" },
  didi: { tier: "other", provider: "didi", displayName: "Di" },
  glovo: { tier: "other", provider: "glovo", displayName: "Glovo" },
  wolt: { tier: "other", provider: "wolt", displayName: "Wolt" },
  deliveroo: { tier: "other", provider: "deliveroo", displayName: "Deliveroo" },
  doordash: { tier: "other", provider: "doordash", displayName: "DoorDash" },
  swiggy: { tier: "other", provider: "swiggy", displayName: "Swiggy" },
  foodpanda: {
    tier: "other",
    provider: "foodpanda",
    displayName: "foodpanda",
  },
  careem: { tier: "other", provider: "careem", displayName: "Careem" },
  grabtaxi: { tier: "other", provider: "grab", displayName: "Grab" },
  steam: { tier: "other", provider: "steam", displayName: "Steam" },
  twilio: { tier: "other", provider: "twilio", displayName: "Twilio" },
  upwork: { tier: "other", provider: "upwork", displayName: "Upwork" },
  fiverr: { tier: "other", provider: "fiverr", displayName: "Fiverr" },
  zoom: { tier: "other", provider: "zoom", displayName: "Zoom" },
  zoho: { tier: "other", provider: "zoho", displayName: "Zoho" },
  github: { tier: "other", provider: "GitHub", displayName: "GitHub" },
  vercel: { tier: "other", provider: "vercel", displayName: "Vercel" },
  paypal: { tier: "other", provider: "paypal_du", displayName: "PayPal" },
  vinted: { tier: "other", provider: "vinted", displayName: "Vinted" },
  depop: { tier: "other", provider: "depop", displayName: "Depop" },
  poshmark: { tier: "other", provider: "poshmark", displayName: "Poshmark" },
  instacart: {
    tier: "other",
    provider: "instacart",
    displayName: "Instacart",
  },
  truecaller: {
    tier: "other",
    provider: "truecaller",
    displayName: "Truecaller",
  },
  pof: { tier: "other", provider: "pof", displayName: "Plenty of Fish" },
  // --- Remaining provider services, priced by the general tier -------------
  // Everything Yankee Verify issues is priced explicitly; none is left without
  // a tier, so no card can fall back to a made-up or cost-only price.
  "7eleven": { tier: "other", provider: "7eleven", displayName: "7-Eleven" },
  adobe: { tier: "other", provider: "adobe", displayName: "Adobe" },
  airtel: { tier: "other", provider: "airtel", displayName: "Airtel" },
  ashleymadison: {
    tier: "other",
    provider: "ashleymadison",
    displayName: "Ashley Madison",
  },
  attapoll: { tier: "other", provider: "attapoll", displayName: "AttaPoll" },
  botim: { tier: "other", provider: "botim", displayName: "Botim" },
  bilibili: { tier: "other", provider: "bilibili", displayName: "Bilibili" },
  bingostars: {
    tier: "other",
    provider: "bingostars",
    displayName: "Bingo Stars",
  },
  bitclout: { tier: "other", provider: "bitclout", displayName: "BitClout" },
  blablacar: { tier: "other", provider: "blablacar", displayName: "BlaBlaCar" },
  carousell: { tier: "other", provider: "carousell", displayName: "Carousell" },
  chargepoint: {
    tier: "other",
    provider: "chargepoint",
    displayName: "ChargePoint",
  },  cloudbet: { tier: "other", provider: "cloudbet", displayName: "Cloudbet" },
  cleartrip: { tier: "other", provider: "cleartrip", displayName: "Cleartrip" },  cocacola: { tier: "other", provider: "cocacola", displayName: "Coca-Cola" },
  craigslist: { tier: "other", provider: "craigslist", displayName: "Craigslist" },  fedex: { tier: "other", provider: "fedex", displayName: "FedEx" },  feeld: { tier: "other", provider: "feeld", displayName: "Feeld" },  flip: { tier: "other", provider: "flip", displayName: "Flip" },
  foodora: { tier: "other", provider: "foodora", displayName: "Foodora" },
  freenow: { tier: "other", provider: "freenow", displayName: "FreeNow" },
  gemini: { tier: "other", provider: "gemini", displayName: "Gemini" },
  getir: { tier: "other", provider: "getir", displayName: "Getir" },
  gett: { tier: "other", provider: "gett", displayName: "Gett" },
  grailed: { tier: "other", provider: "grailed", displayName: "Grailed" },
  haraj: { tier: "other", provider: "haraj", displayName: "Haraj" },
  hopp: { tier: "other", provider: "hopp", displayName: "Hopp" },
  idealista: { tier: "other", provider: "idealista", displayName: "Idealista" },
  indeed: { tier: "other", provider: "indeed", displayName: "Indeed" },
  ipsosisay: { tier: "other", provider: "ipsosisay", displayName: "Ipsos iSay" },
  justdating: {
    tier: "other",
    provider: "justdating",
    displayName: "JustDating",
  },
  kaggle: { tier: "other", provider: "kaggle", displayName: "Kaggle" },
  likee: { tier: "other", provider: "likee", displayName: "Likee" },
  manus: { tier: "other", provider: "manus", displayName: "Manus" },
  match: { tier: "other", provider: "match", displayName: "Match" },
  michat: { tier: "other", provider: "michat", displayName: "MiChat" },
  mocospace: { tier: "other", provider: "mocospace", displayName: "MocoSpace" },
  my11circle: { tier: "other", provider: "my11circle", displayName: "My11Circle" },
  myntra: { tier: "other", provider: "myntra", displayName: "Myntra" },
  ncsoft: { tier: "other", provider: "ncsoft", displayName: "NCSoft" },
  naver: { tier: "other", provider: "naver", displayName: "Naver" },
  nextdoor: { tier: "other", provider: "nextdoor", displayName: "Nextdoor" },
  nike: { tier: "other", provider: "nike", displayName: "Nike" },
  nobroker: { tier: "other", provider: "nobroker", displayName: "NoBroker" },
  oppo: { tier: "other", provider: "oppo", displayName: "Oppo" },
  offgamers: { tier: "other", provider: "offgamers", displayName: "OffGamers" },
  other: { tier: "other", provider: "other", displayName: "Other services" },
  pinduoduo: { tier: "other", provider: "pinduoduo", displayName: "Pinduoduo" },
  rapido: { tier: "other", provider: "rapido", displayName: "Rapido" },
  rappi: { tier: "other", provider: "rappi", displayName: "Rappi" },
  razer: { tier: "other", provider: "razer", displayName: "Razer" },
  rebtel: { tier: "other", provider: "rebtel", displayName: "Rebtel" },
  redbubble: { tier: "other", provider: "redbubble", displayName: "Redbubble" },
  roblox: { tier: "other", provider: "roblox", displayName: "Roblox" },
  rummygold: { tier: "other", provider: "rummygold", displayName: "Rummy Gold" },
  rummyloot: { tier: "other", provider: "rummyloot", displayName: "Rummy Loot" },
  signalhire: {
    tier: "other",
    provider: "signalhire",
    displayName: "SignalHire",
  },
  smitten: { tier: "other", provider: "smitten", displayName: "Smitten" },
  subito: { tier: "other", provider: "subito", displayName: "Subito" },
  supercom: { tier: "other", provider: "supercom", displayName: "Super.com" },
  talabat: { tier: "other", provider: "talabat", displayName: "Talabat" },
  tencentqq: { tier: "other", provider: "tencentqq", displayName: "Tencent QQ" },
  ticketmaster: {
    tier: "other",
    provider: "ticketmaster",
    displayName: "Ticketmaster",
  },
  trendyol: { tier: "other", provider: "trendyol", displayName: "Trendyol" },
  truthsocial: {
    tier: "other",
    provider: "truthsocial",
    displayName: "Truth Social",
  },
  ubisoft: { tier: "other", provider: "ubisoft", displayName: "Ubisoft" },
  uklon: { tier: "other", provider: "uklon", displayName: "Uklon" },
  upward: { tier: "other", provider: "upward", displayName: "Upward" },
  whatnot: { tier: "other", provider: "whatnot", displayName: "Whatnot" },
  yalla: { tier: "other", provider: "yalla", displayName: "Yalla" },
  yikyak: { tier: "other", provider: "yikyak", displayName: "Yik Yak" },
  iplum: { tier: "other", provider: "iplum", displayName: "iPlum" },
  kimi: { tier: "other", provider: "kimi", displayName: "Kimi" },
  nvidia: { tier: "other", provider: "nvidia", displayName: "NVIDIA" },
  perplexity: {
    tier: "other",
    provider: "perplexity",
    displayName: "Perplexity",
  },
  polymarket: { tier: "other", provider: "polymarket", displayName: "Polymarket" },
  seated: { tier: "other", provider: "seated", displayName: "Seated" },
  triumph: { tier: "other", provider: "triumph", displayName: "Triumph" },
};

function readNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Global knobs shared by every tier. */
export function getPricingConfig() {
  return {
    // Legacy global markup (NUMBER_PRICE_MARKUP_PERCENT), kept for the health
    // page; each tier carries its own markup.
    markupPercent: readNonNegativeNumber(
      process.env.NUMBER_PRICE_MARKUP_PERCENT,
      0,
    ),
    // Chargeback / processing allowance per sale, in naira.
    feeNaira: readNonNegativeNumber(process.env.NUMBER_PRICE_FEE_NAIRA, 0),
    // No sale may run below this profit.
    minProfitNaira: readNonNegativeNumber(
      process.env.NUMBER_MIN_PROFIT_NAIRA,
      50,
    ),
    // Used when a fixed tier's cost is above its ceiling.
    overCeilingMarkupPercent: readNonNegativeNumber(
      process.env.NUMBER_OVER_CEILING_MARKUP_PERCENT,
      30,
    ),
    // Allow the generic "other" tier for services not named above. Off by
    // default: an unnamed service is never silently given a price.
    allowOtherTier:
      String(process.env.NUMBER_ALLOW_OTHER_TIER || "false")
        .trim()
        .toLowerCase() === "true",
  };
}

/**
 * A tier's configuration with environment overrides:
 *   PRICE_<KEY>                  exact selling price
 *   PRICE_<KEY>_MIN / _MAX       window for a fixed price
 *   PRICE_<KEY>_MARKUP_PERCENT   markup for a margin price
 *   PRICE_<KEY>_MODE             "fixed" | "margin"
 */
export function getTierConfig(tierKey) {
  const tier = PRICE_TIERS[tierKey];
  if (!tier) return null;

  const prefix = `PRICE_${String(tierKey).toUpperCase()}`;
  const env = (suffix, fallback) => {
    const raw = process.env[`${prefix}_${suffix}`];
    if (raw === undefined || raw === "") return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  const requestedMode = String(process.env[`${prefix}_MODE`] || "")
    .trim()
    .toLowerCase();

  return {
    key: tierKey,
    label: tier.label,
    mode: requestedMode === "margin" || requestedMode === "fixed"
      ? requestedMode
      : tier.mode,
    base: env("PRICE", tier.base),
    min: env("MIN", tier.min),
    max: env("MAX", tier.max),
    markupPercent: env("MARKUP_PERCENT", tier.markupPercent ?? 40),
    // A tier may demand a higher profit than the global minimum (Telegram
    // old/open, which must not be sold from a cheap fresh cost).
    minProfit: env("MIN_PROFIT", tier.minProfit ?? 0),
  };
}

function roundUpToNearestTen(value) {
  return Math.ceil(value / 10) * 10;
}

/**
 * Price ONE variant.
 *
 * @param {{cost:number, serviceId?:string, variantId?:string, tierKey?:string}} input
 * @param {ReturnType<typeof getPricingConfig>} [config]
 * @returns {null | {
 *   tierKey:string, tierLabel:string, price:number, cost:number, fee:number,
 *   profit:number, status:"ok"|"below-min-profit"|"above-ceiling",
 *   requestedPrice:number|null, note:string|null
 * }}
 *
 * An unprofitable variant is still returned - with its real cost, status
 * "below-min-profit" and a note - so the caller can explain WHY it cannot be
 * sold instead of quietly charging a different amount.
 */
export function priceVariant(input, config = getPricingConfig()) {
  const cost = Number(input?.cost);
  if (!Number.isFinite(cost) || cost <= 0) return null;

  const tierKey = input?.tierKey || resolveTierKey(input?.serviceId, input?.variantId);
  const tier = getTierConfig(tierKey);
  if (!tier) return null;

  const fee = Number(config.feeNaira) || 0;
  const minProfit = Math.max(
    Number(config.minProfitNaira) || 0,
    Number(tier.minProfit) || 0,
  );
  const overMarkup = Number(config.overCeilingMarkupPercent) || 0;

  const requested = Math.ceil(tier.base);
  let price;

  if (tier.mode === "margin") {
    // The base is the default while it already earns the markup; it is never
    // allowed to sell at a loss just because it was configured that way.
    price = roundUpToNearestTen(
      Math.max(tier.base, cost * (1 + tier.markupPercent / 100)),
    );
  } else if (requested < cost + fee + minProfit) {
    // Above the ceiling: step up so the sale still earns a margin.
    price = roundUpToNearestTen(
      Math.max(tier.max, cost * (1 + overMarkup / 100)),
    );
  } else {
    price = requested;
  }

  price = Math.min(Math.max(price, 1), 10_000_000);

  const profit = price - cost - fee;
  let status = "ok";
  let note = null;

  if (profit < minProfit) {
    status = "below-min-profit";
    note =
      `Provider cost ₦${cost.toLocaleString()} is too high for a ₦${price.toLocaleString()} sale ` +
      `(profit ₦${profit.toLocaleString()}; minimum ₦${minProfit.toLocaleString()} after ₦${fee.toLocaleString()} fees).`;
  } else if (tier.mode === "fixed" && requested < cost + fee + minProfit) {
    // The configured price window cannot cover this cost (at or beyond its
    // ceiling), so the price steps above the window to stay profitable.
    status = "above-ceiling";
    note =
      `Provider cost ₦${cost.toLocaleString()} does not fit the ₦${tier.min.toLocaleString()}-₦${tier.max.toLocaleString()} price window, ` +
      `so this sells at ₦${price.toLocaleString()} to stay profitable.`;
  } else if (tier.mode === "fixed" && price > requested) {
    note =
      `Provider cost ₦${cost.toLocaleString()} is above the ₦${requested.toLocaleString()} default, ` +
      `so this sells at ₦${price.toLocaleString()} (within the ₦${tier.min.toLocaleString()}-₦${tier.max.toLocaleString()} window).`;
  } else if (tier.mode === "margin" && price > requested) {
    note =
      `Provider cost ₦${cost.toLocaleString()} is above the ₦${requested.toLocaleString()} target, ` +
      `so this sells at ₦${price.toLocaleString()} (${tier.markupPercent}% over cost).`;
  }

  return {
    tierKey,
    tierLabel: tier.label,
    price,
    cost,
    fee,
    profit,
    status,
    requestedPrice: requested,
    note,
  };
}

/**
 * Tier for a variant, honouring (in order):
 *   1. a per-card variant environment override
 *      (PRICE_WHATSAPP_OTHER_VARIANTS=virtual4, PRICE_TELEGRAM_OLD_VARIANTS=x)
 *   2. the card's built-in variant table
 *   3. the card's default tier
 *
 * `serviceId` may be a catalogue id ("telegram") or a card id ("gmail").
 */
export function resolveTierKey(serviceId, variantId) {
  const entry = SELLABLE_SERVICES[String(serviceId || "")];
  if (!entry) return null;

  const variant = String(variantId || "");

  // 1. Operator-declared variant membership.
  for (const tierKey of entry.pricingTiers || [entry.tier]) {
    const declared = String(
      process.env[`PRICE_${tierKey.toUpperCase()}_VARIANTS`] || "",
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (variant && declared.includes(variant)) return tierKey;
  }

  // 2. The built-in variant table.
  const byVariant = entry.variants?.[variant];
  if (byVariant) return byVariant;

  // 3. Default tier.
  return entry.tier;
}

/**
 * The ACC catalogue service id that holds a card's variants. Normally the card
 * id itself; "gmail" and "whatsapp_other" borrow another service's variants
 * because ACC has no separate entry for them.
 */
export function resolveCatalogueService(serviceId) {
  const entry = SELLABLE_SERVICES[String(serviceId || "")];
  if (!entry) return null;
  return entry.catalogueService || String(serviceId);
}

/**
 * The tiers a card may be priced by, cheapest first. This is what a card's
 * "from ₦x" is taken from, so two WhatsApp products never claim the same price.
 */
export function getCardTiers(serviceId) {
  const entry = SELLABLE_SERVICES[String(serviceId || "")];
  if (!entry) return [];
  return entry.pricingTiers || [entry.tier];
}

/**
 * The naira price we charge for one catalogue variant, or null when the cost
 * is unusable or the variant cannot be sold profitably.
 *
 * @param {number} cost the provider cost from the catalogue
 * @returns {number|null} whole naira
 */
export function getSellingPrice(cost, config = getPricingConfig(), meta = {}) {
  const priced = priceVariant({ cost, ...meta }, config);
  if (!priced || priced.status === "below-min-profit") return null;
  return priced.price;
}

/** Why a service cannot be bought, or null when it can. */
export function getBlockedReason(serviceId) {
  return BLOCKED_SERVICES[String(serviceId || "")]?.reason || null;
}
