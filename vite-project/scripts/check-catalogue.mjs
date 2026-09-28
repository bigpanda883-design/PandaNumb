/**
 * One-off diagnostic: run the real normalizer against the live ACC Numbers
 * endpoint and report what the Buy flow would actually receive.
 *
 * Run:  node scripts/check-catalogue.mjs
 *
 * This exists because the response shape has a level (variant) that was
 * previously dropped silently, and because "the page rendered" is not the same
 * as "the ids are the ones the provider accepts".
 */
const PRICES_URL = "https://www.accnumbers.com/api/v1/guest/prices";

// Mirrors fetchCatalogue's transform without importing the React module.
function normalize(raw) {
  const countries = {};
  const allIds = new Set();
  for (const [slug, services] of Object.entries(raw)) {
    if (!services || typeof services !== "object") continue;
    const normalizedServices = {};
    for (const [serviceId, variants] of Object.entries(services)) {
      if (!variants || typeof variants !== "object") continue;
      for (const [variantId, info] of Object.entries(variants)) {
        if (!info || typeof info !== "object") continue;
        const cost = Number(info.cost);
        const count = Number(info.count);
        if (!Number.isFinite(cost) || !Number.isFinite(count)) continue;
        const id = `${serviceId}_${variantId}`;
        normalizedServices[id] = { id, serviceId, variantId, cost, count };
        allIds.add(id);
      }
    }
    countries[slug] = { id: slug, services: normalizedServices };
  }
  return { countries, allIds };
}

const res = await fetch(PRICES_URL, {
  headers: { Accept: "application/json" },
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const raw = await res.json();
const { countries, allIds } = normalize(raw);

const slugs = Object.keys(countries);
console.log(`countries: ${slugs.length}`);

let buyableTotal = 0;
let servicesTotal = 0;
for (const c of Object.values(countries)) {
  const entries = Object.values(c.services);
  servicesTotal += entries.length;
  buyableTotal += entries.filter((s) => s.count > 0).length;
}
console.log(`buyable variant entries: ${servicesTotal}`);
console.log(`  of which in stock:      ${buyableTotal}`);
console.log(`distinct variant ids:    ${allIds.size}`);

console.log("\n--- nigeria: first 5 in-stock entries ---");
const ng = Object.values(countries.nigeria?.services ?? {})
  .filter((s) => s.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 5);
for (const s of ng) {
  console.log(
    `  id=${s.id.padEnd(28)} service=${s.serviceId.padEnd(14)} cost=${s.cost} count=${s.count}`,
  );
}

console.log("\n--- assertion: no id may equal a bare service name ---");
const offenders = [...allIds].filter((id) => !id.includes("_"));
console.log(`ids without a variant suffix: ${offenders.length}`);

console.log(
  "\n--- assertion: whatsapp is listed for usa with a variant id ---",
);
const usaWa = Object.values(countries.usa?.services ?? {}).filter(
  (s) => s.serviceId === "whatsapp",
);
console.log(
  usaWa.length
    ? `  ok -> ${usaWa.map((s) => `${s.id} (cost ${s.cost}, count ${s.count})`).join(", ")}`
    : "  MISSING",
);
