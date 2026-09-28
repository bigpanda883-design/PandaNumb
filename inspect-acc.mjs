// Fetches the ACC Numbers prices endpoint and reports its REAL structure.
// Written to run in one shot so nothing is guessed about the response shape.
import fs from "node:fs";

const URL = "https://www.accnumbers.com/api/v1/guest/prices";

const response = await fetch(URL, {
  headers: { Accept: "application/json" },
});
console.log("HTTP STATUS:", response.status);
console.log("CONTENT-TYPE:", response.headers.get("content-type"));

const text = await response.text();
console.log("BODY LENGTH:", text.length);

// Keep a copy for inspection / offline development.
fs.writeFileSync("acc-prices.json", text);

let data;
try {
  data = JSON.parse(text);
} catch (error) {
  console.log("NOT JSON:", error.message);
  console.log("FIRST 500 CHARS:", text.slice(0, 500));
  process.exit(0);
}

console.log("\n=== TOP LEVEL ===");
console.log("IS ARRAY:", Array.isArray(data));
console.log(
  "KEYS:",
  Array.isArray(data)
    ? `(array of ${data.length})`
    : JSON.stringify(Object.keys(data).slice(0, 30)),
);

// Walk into the structure and print a real sample.
if (!Array.isArray(data)) {
  for (const key of Object.keys(data).slice(0, 5)) {
    const value = data[key];
    console.log(
      `\n--- key "${key}" -------------------------------------------------`,
    );
    console.log(
      "TYPE:",
      Array.isArray(value) ? `array(${value.length})` : typeof value,
    );
    if (value && typeof value === "object") {
      const sampleKey = Array.isArray(value)
        ? value[0]
        : value[Object.keys(value)[0]];
      console.log("SAMPLE:", JSON.stringify(sampleKey, null, 2)?.slice(0, 900));
      if (Array.isArray(value) && value.length > 1) {
        console.log("SECOND ITEM:", JSON.stringify(value[1]).slice(0, 400));
      }
    } else {
      console.log("VALUE:", String(value).slice(0, 200));
    }
  }
} else {
  console.log("FIRST ITEM:", JSON.stringify(data[0], null, 2)?.slice(0, 900));
  console.log("SECOND ITEM:", JSON.stringify(data[1], null, 2)?.slice(0, 500));
}
