/**
 * Panda Numbers - application logo + label catalogue
 * ==================================================
 * Maps an ACC Numbers service id (e.g. "whatsapp") to a real brand icon and a
 * human-readable label.
 *
 * The ACC Numbers API returns ids only - no names and no images - so this is the
 * single place that supplies identity. Rules:
 *
 *   1. If the id is mapped here, show the official brand icon (React Icons).
 *   2. If it is not mapped, DO NOT invent a logo. Fall back to a generic icon
 *      and a prettified label derived from the id.
 *
 * The id itself is always displayed, so nothing is misrepresented.
 */
import {
  SiWhatsapp,
  SiTelegram,
  SiInstagram,
  SiFacebook,
  SiTiktok,
  SiX,
  SiApple,
  SiGoogle,
  SiNetflix,
  SiSnapchat,
  SiTinder,
  SiDiscord,
  SiYoutube,
  SiSpotify,
  SiUber,
  SiAirbnb,
  SiCoinbase,
  SiFiverr,
  SiTwitch,
  SiReddit,
  SiPinterest,
  SiShopee,
  SiAliexpress,
  SiAlibabadotcom,
  SiPaypal,
  SiVenmo,
  SiWise,
  SiBinance,
  SiRevolut,
  SiDropbox,
  SiGithub,
  SiGitlab,
  SiSteam,
  SiEpicgames,
  SiUbisoft,
  SiDuolingo,
  SiCoursera,
  SiUdemy,
  SiZoom,
  SiSignal,
  SiViber,
  SiWechat,
  SiLine,
  SiKakaotalk,
  SiTumblr,
  SiClaude,
} from "react-icons/si";
import {
  FaAmazon,
  FaMicrosoft,
  FaLinkedin,
  FaRobot,
  FaBagShopping,
  FaBuilding,
  FaGamepad,
  FaMobileScreen,
  FaSkype,
  FaYahoo,
} from "react-icons/fa6";
import {
  SiUbereats,
  SiDoordash,
  SiSwiggy,
  SiZomato,
  SiDeliveroo,
  SiJusteat,
  SiMercadopago,
  SiEbay,
  SiEtsy,
  SiShopify,
  SiTrustpilot,
} from "react-icons/si";

/**
 * Known brand mappings.
 *
 * KEY   = the exact ACC Numbers service id (lowercase, no spaces)
 * VALUE = { label, Icon, color }
 *
 * Only add an entry when the id unambiguously identifies that brand.
 */
export const APP_CATALOG = {
  // --- Messaging / social ------------------------------------------------
  whatsapp: { label: "WhatsApp", Icon: SiWhatsapp, color: "#25D366" },
  telegram: { label: "Telegram", Icon: SiTelegram, color: "#24A1DE" },
  instagram: { label: "Instagram", Icon: SiInstagram, color: "#E4405F" },
  facebook: { label: "Facebook", Icon: SiFacebook, color: "#1877F2" },
  messenger: { label: "Messenger", Icon: SiFacebook, color: "#0084FF" },
  tiktok: { label: "TikTok", Icon: SiTiktok, color: "#010101" },
  twitter: { label: "X (Twitter)", Icon: SiX, color: "#000000" },
  snapchat: { label: "Snapchat", Icon: SiSnapchat, color: "#FFFC00" },
  discord: { label: "Discord", Icon: SiDiscord, color: "#5865F2" },
  signal: { label: "Signal", Icon: SiSignal, color: "#3A76F0" },
  viber: { label: "Viber", Icon: SiViber, color: "#7360F2" },
  wechat: { label: "WeChat", Icon: SiWechat, color: "#07C160" },
  line: { label: "LINE", Icon: SiLine, color: "#06C755" },
  kakaotalk: { label: "KakaoTalk", Icon: SiKakaotalk, color: "#FEE500" },
  skype: { label: "Skype", Icon: FaSkype, color: "#0078D4" },
  imo: { label: "imo", Icon: SiSignal, color: "#2B8AFF" },
  weibo: { label: "Weibo", Icon: FaYahoo, color: "#E6162D" },
  tumblr: { label: "Tumblr", Icon: SiTumblr, color: "#36465D" },
  reddit: { label: "Reddit", Icon: SiReddit, color: "#FF4500" },
  pinterest: { label: "Pinterest", Icon: SiPinterest, color: "#BD081C" },
  linkedin: { label: "LinkedIn", Icon: FaLinkedin, color: "#0A66C2" },
  bigolive: { label: "Bigo Live", Icon: SiTiktok, color: "#00C3FF" },
  likee: { label: "Likee", Icon: SiTiktok, color: "#FF1361" },
  kwai: { label: "Kwai", Icon: SiTiktok, color: "#FF5000" },
  clubhouse: { label: "Clubhouse", Icon: SiSignal, color: "#F0E6D2" },

  // --- Google / Apple / Microsoft ---------------------------------------
  google: { label: "Google", Icon: SiGoogle, color: "#4285F4" },
  googlevoice: { label: "Google Voice", Icon: SiGoogle, color: "#34A853" },
  gmail: { label: "Gmail", Icon: SiGoogle, color: "#EA4335" },
  apple: { label: "Apple", Icon: SiApple, color: "#000000" },
  microsoft: { label: "Microsoft", Icon: FaMicrosoft, color: "#00A4EF" },
  hotmail: { label: "Outlook / Hotmail", Icon: FaMicrosoft, color: "#0078D4" },
  yahoo: { label: "Yahoo", Icon: FaYahoo, color: "#6001D2" },
  aol: { label: "AOL", Icon: FaYahoo, color: "#3399FF" },
  protonmail: { label: "Proton Mail", Icon: SiGoogle, color: "#6D4AFF" },

  // --- Streaming --------------------------------------------------------
  netflix: { label: "Netflix", Icon: SiNetflix, color: "#E50914" },
  youtube: { label: "YouTube", Icon: SiYoutube, color: "#FF0000" },
  spotify: { label: "Spotify", Icon: SiSpotify, color: "#1DB954" },
  twitch: { label: "Twitch", Icon: SiTwitch, color: "#9146FF" },
  disneyhotstar: {
    label: "Disney+ Hotstar",
    Icon: SiNetflix,
    color: "#113CCF",
  },
  jiocinema: { label: "JioCinema", Icon: SiNetflix, color: "#D8125B" },
  iqiyi: { label: "iQIYI", Icon: SiNetflix, color: "#00CC36" },
  wetv: { label: "WeTV", Icon: SiNetflix, color: "#FF6A00" },
  huya: { label: "Huya", Icon: SiTwitch, color: "#FFA500" },
  douyu: { label: "Douyu", Icon: SiTwitch, color: "#FF5D23" },

  // --- AI ---------------------------------------------------------------
  openai: { label: "OpenAI / ChatGPT", Icon: FaRobot, color: "#10A37F" },
  claudeai: { label: "Claude AI", Icon: SiClaude, color: "#D97757" },
  deepseek: { label: "DeepSeek", Icon: FaRobot, color: "#4D6BFE" },
  zhipuai: { label: "Zhipu AI", Icon: FaRobot, color: "#3859FF" },

  // --- Shopping / marketplaces -----------------------------------------
  amazon: { label: "Amazon", Icon: FaAmazon, color: "#FF9900" },
  ebay: { label: "eBay", Icon: SiEbay, color: "#E53238" },
  etsy: { label: "Etsy", Icon: SiEtsy, color: "#F16521" },
  aliexpress: { label: "AliExpress", Icon: SiAliexpress, color: "#FF4747" },
  alibaba: { label: "Alibaba", Icon: SiAlibabadotcom, color: "#FF6A00" },
  shopee: { label: "Shopee", Icon: SiShopee, color: "#EE4D2D" },
  lazada: { label: "Lazada", Icon: SiShopee, color: "#0F146D" },
  flipkart: { label: "Flipkart", Icon: SiShopify, color: "#2874F0" },
  meesho: { label: "Meesho", Icon: SiShopify, color: "#F43397" },
  // react-icons ships SiMercadopago (the brand's payment mark); there is no
  // SiMercadolibre export, so this must stay SiMercadopago.
  mercadolibre: {
    label: "Mercado Libre",
    Icon: SiMercadopago,
    color: "#FFE600",
  },
  walmart: { label: "Walmart", Icon: SiShopify, color: "#0071CE" },
  trendyol: { label: "Trendyol", Icon: FaBagShopping, color: "#F27A1A" },
  shopify: { label: "Shopify", Icon: SiShopify, color: "#7AB55C" },
  daraz: { label: "Daraz", Icon: FaBagShopping, color: "#F85606" },
  taobao: { label: "Taobao", Icon: SiAlibabadotcom, color: "#FF4200" },
  jd: { label: "JD.com", Icon: SiAlibabadotcom, color: "#E1251B" },
  coupang: { label: "Coupang", Icon: FaBagShopping, color: "#346AFF" },
  ozon: { label: "Ozon", Icon: FaBagShopping, color: "#005BFF" },

  // --- Food delivery ----------------------------------------------------
  ubereats: { label: "Uber Eats", Icon: SiUbereats, color: "#06C167" },
  doordash: { label: "DoorDash", Icon: SiDoordash, color: "#FF3008" },
  grubhub: { label: "Grubhub", Icon: SiDoordash, color: "#F63440" },
  swiggy: { label: "Swiggy", Icon: SiSwiggy, color: "#FC8019" },
  zomato: { label: "Zomato", Icon: SiZomato, color: "#E23744" },
  deliveroo: { label: "Deliveroo", Icon: SiDeliveroo, color: "#00CCBC" },
  justeat: { label: "Just Eat", Icon: SiJusteat, color: "#FF8000" },
  foodpanda: { label: "foodpanda", Icon: SiDeliveroo, color: "#D70F64" },
  talabat: { label: "Talabat", Icon: SiDeliveroo, color: "#FF5A00" },
  glovo: { label: "Glovo", Icon: SiDeliveroo, color: "#FFC244" },
  wolt: { label: "Wolt", Icon: SiDeliveroo, color: "#00C2E8" },
  delivero: { label: "Deliveroo", Icon: SiDeliveroo, color: "#00CCBC" },

  // --- Ride hailing / travel -------------------------------------------
  uber: { label: "Uber", Icon: SiUber, color: "#000000" },
  bolt: { label: "Bolt", Icon: SiUber, color: "#34D186" },
  grab: { label: "Grab", Icon: SiUber, color: "#00B14F" },
  grabtaxi: { label: "GrabTaxi", Icon: SiUber, color: "#00B14F" },
  gojek: { label: "Gojek", Icon: SiUber, color: "#00AA13" },
  indriver: { label: "inDrive", Icon: SiUber, color: "#C4F000" },
  careem: { label: "Careem", Icon: SiUber, color: "#00C2A8" },
  didi: { label: "DiDi", Icon: SiUber, color: "#FF7D41" },
  airbnb: { label: "Airbnb", Icon: SiAirbnb, color: "#FF5A5F" },
  booking: { label: "Booking.com", Icon: FaBuilding, color: "#003580" },
  hotels: { label: "Hotels.com", Icon: FaBuilding, color: "#D32F2F" },
  agoda: { label: "Agoda", Icon: FaBuilding, color: "#F9436B" },

  // --- Finance / crypto -------------------------------------------------
  paypal: { label: "PayPal", Icon: SiPaypal, color: "#003087" },
  venmo: { label: "Venmo", Icon: SiVenmo, color: "#3D95CE" },
  wise: { label: "Wise", Icon: SiWise, color: "#9FE870" },
  coinbase: { label: "Coinbase", Icon: SiCoinbase, color: "#0052FF" },
  binance: { label: "Binance", Icon: SiBinance, color: "#F0B90B" },
  revolut: { label: "Revolut", Icon: SiRevolut, color: "#0075EB" },
  cryptocom: { label: "Crypto.com", Icon: SiCoinbase, color: "#119EE6" },
  kucoin: { label: "KuCoin", Icon: SiBinance, color: "#24AE8F" },
  okx: { label: "OKX", Icon: SiBinance, color: "#000000" },
  skrill: { label: "Skrill", Icon: SiPaypal, color: "#8A1D96" },
  payoneer: { label: "Payoneer", Icon: SiPaypal, color: "#FF4800" },
  stripe: { label: "Stripe", Icon: SiPaypal, color: "#635BFF" },

  // --- Work / learning / tools ------------------------------------------
  fiverr: { label: "Fiverr", Icon: SiFiverr, color: "#1DBF73" },
  upwork: { label: "Upwork", Icon: SiFiverr, color: "#14A800" },
  freelancercom: { label: "Freelancer", Icon: SiFiverr, color: "#29B2FE" },
  github: { label: "GitHub", Icon: SiGithub, color: "#181717" },
  gitlab: { label: "GitLab", Icon: SiGitlab, color: "#FC6D26" },
  dropbox: { label: "Dropbox", Icon: SiDropbox, color: "#0061FF" },
  duolingo: { label: "Duolingo", Icon: SiDuolingo, color: "#58CC02" },
  coursera: { label: "Coursera", Icon: SiCoursera, color: "#0056D2" },
  udemy: { label: "Udemy", Icon: SiUdemy, color: "#A435F0" },
  kaggle: { label: "Kaggle", Icon: SiGithub, color: "#20BEFF" },
  vercel: { label: "Vercel", Icon: SiGithub, color: "#000000" },
  zoho: { label: "Zoho", Icon: FaBuilding, color: "#E42527" },
  zoom: { label: "Zoom", Icon: SiZoom, color: "#0B5CFF" },

  // --- Gaming -----------------------------------------------------------
  steam: { label: "Steam", Icon: SiSteam, color: "#171A21" },
  epicgames: { label: "Epic Games", Icon: SiEpicgames, color: "#313131" },
  blizzard: { label: "Blizzard", Icon: FaGamepad, color: "#148EFF" },
  ubisoft: { label: "Ubisoft", Icon: SiUbisoft, color: "#000000" },
  ea: { label: "EA", Icon: FaGamepad, color: "#FF0000" },
  pubg: { label: "PUBG", Icon: FaGamepad, color: "#F2A900" },
  discordgaming: { label: "Discord", Icon: SiDiscord, color: "#5865F2" },
  garena: { label: "Garena", Icon: FaGamepad, color: "#EE3124" },
  hoyoverse: { label: "HoYoverse", Icon: FaGamepad, color: "#4A9FE8" },
  mahjong: { label: "Mahjong", Icon: FaGamepad, color: "#8B4513" },

  // --- Dating -----------------------------------------------------------
  tinder: { label: "Tinder", Icon: SiTinder, color: "#FE3C72" },
  bumble: { label: "Bumble", Icon: SiTinder, color: "#FFC629" },
  hinge: { label: "Hinge", Icon: SiTinder, color: "#000000" },
  badoo: { label: "Badoo", Icon: SiTinder, color: "#783BF9" },
  happn: { label: "Happn", Icon: SiTinder, color: "#E5315B" },
  grindr: { label: "Grindr", Icon: SiTinder, color: "#FFCF00" },

  // --- Reviews / surveys ------------------------------------------------
  trustpilot: { label: "Trustpilot", Icon: SiTrustpilot, color: "#00B67A" },
  swagbucks: { label: "Swagbucks", Icon: SiTrustpilot, color: "#FFC107" },
  surveytime: { label: "SurveyTime", Icon: SiTrustpilot, color: "#00A3E0" },
  yougovshopper: { label: "YouGov", Icon: SiTrustpilot, color: "#5C2D91" },
};

/** Generic fallback so an unmapped app still renders a consistent card. */
export const FALLBACK_ICON = FaMobileScreen;
export const FALLBACK_COLOR = "#64748b";

/**
 * Turn an unmapped id into a readable label.
 * "googlevoice" -> "Googlevoice"?  We keep it honest and simple: capitalise.
 * We never claim a brand identity we are not sure of.
 */
export function prettifyServiceId(id) {
  if (!id) return "Unknown service";
  // Split on separators if the provider ever uses them.
  const words = String(id)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Resolve the display identity for a service id.
 *
 * @returns {{label:string, Icon:Function, color:string, isKnown:boolean}}
 */
export function getAppIdentity(serviceId) {
  const key = String(serviceId || "").toLowerCase();
  const mapped = APP_CATALOG[key];

  if (mapped) {
    return { ...mapped, isKnown: true };
  }

  return {
    label: prettifyServiceId(serviceId),
    Icon: FALLBACK_ICON,
    color: FALLBACK_COLOR,
    isKnown: false,
  };
}
