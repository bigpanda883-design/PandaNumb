// Extracts the REAL country keys and REAL (non-virtual) service ids from the
// downloaded ACC Numbers response, so the generated mapping files are grounded
// in the actual payload rather than guesses.
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("acc-prices.json", "utf8"));
const countries = Object.keys(data).sort();

const allServiceIds = new Set();
for (const country of countries) {
  Object.keys(data[country]).forEach((id) => allServiceIds.add(id));
}

// "virtualNN" ids carry no identity; the rest are real service names.
const named = [...allServiceIds]
  .filter((id) => !/^virtual\d+$/i.test(id))
  .sort();
const virtual = [...allServiceIds]
  .filter((id) => /^virtual\d+$/i.test(id))
  .sort();

console.log("=== COUNTRY COUNT:", countries.length);
console.log(JSON.stringify(countries, null, 0));

console.log("\n=== NAMED SERVICE IDS:", named.length);
console.log(JSON.stringify(named, null, 0));

console.log("\n=== VIRTUAL (unidentified) IDS:", virtual.length);
console.log(virtual.join(", "));

// Which countries contain any named service?
console.log("\n=== COUNTRIES WITH NAMED SERVICES ===");
countries.forEach((c) => {
  const names = Object.keys(data[c]).filter((id) => !/^virtual\d+$/i.test(id));
  if (names.length) console.log(`${c}: ${names.join(", ")}`);
});
