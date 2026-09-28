// Generates the country slug list from the REAL API response so the mapping
// file is grounded in fact rather than hand-written guesses.
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("acc-prices.json", "utf8"));
const slugs = Object.keys(data).sort();

console.log("COUNT:", slugs.length);
console.log(slugs.join("\n"));
