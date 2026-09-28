// Deeper inspection: what are the "virtualNN" service ids, and do any
// human-readable service names exist anywhere in the payload?
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("acc-prices.json", "utf8"));
const countries = Object.keys(data);
console.log("COUNTRY COUNT:", countries.length);

// Collect every distinct service id across all countries.
const serviceIds = new Set();
for (const country of countries) {
  for (const id of Object.keys(data[country])) serviceIds.add(id);
}
const ids = [...serviceIds].sort();
console.log("\nDISTINCT SERVICE IDS:", ids.length);
console.log(ids.join(", "));

// Any service with available stock anywhere?
console.log("\n=== SERVICES WITH STOCK (count > 0) ===");
let withStock = 0;
for (const country of countries) {
  for (const [id, info] of Object.entries(data[country])) {
    if (Number(info.count) > 0) {
      withStock += 1;
      if (withStock <= 25) {
        console.log(
          `${country} / ${id} -> count=${info.count} cost=${info.cost}`,
        );
      }
    }
  }
}
console.log("TOTAL country/service pairs with stock:", withStock);

// Which countries actually have ANY stock?
console.log("\n=== COUNTRIES WITH ANY STOCK ===");
const stocked = countries.filter((c) =>
  Object.values(data[c]).some((v) => Number(v.count) > 0),
);
console.log("COUNT:", stocked.length);
console.log(stocked.slice(0, 60).join(", "));

// Full field set seen on a service entry.
console.log("\n=== ALL FIELDS SEEN ON SERVICE ENTRIES ===");
const fields = new Set();
for (const country of countries) {
  for (const info of Object.values(data[country])) {
    Object.keys(info).forEach((k) => fields.add(k));
  }
}
console.log([...fields].join(", "));

// Does any name/label/title exist anywhere?
const raw = fs.readFileSync("acc-prices.json", "utf8");
console.log("\n=== SEARCHING FOR NAME-LIKE KEYS ===");
["name", "title", "service", "label", "app", "description"].forEach(
  (needle) => {
    const hits = (raw.match(new RegExp(`"${needle}"`, "g")) || []).length;
    console.log(`"${needle}": ${hits} occurrences`);
  },
);

// Sample one country entry in full to show the exact nesting.
console.log("\n=== FULL SAMPLE: unitedstates ===");
console.log(JSON.stringify(data.unitedstates, null, 2)?.slice(0, 1200));
