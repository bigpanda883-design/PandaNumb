import assert from "node:assert/strict";
import test from "node:test";

const originalFetch = globalThis.fetch;
const originalBase = globalThis.__PANDA_API_BASE_URL__;
globalThis.__PANDA_API_BASE_URL__ = "https://api.example.test";

const {
  clearCatalogueCache,
  fetchCatalogue,
  getServiceOffers,
} = await import("./accPrices.js");

test("ACC catalogue loads from the backend API and keeps server selling prices", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/status")) {
      return Response.json({ ready: true, loading: false });
    }

    return Response.json({
      countries: {
        usa: {
          whatsapp: {
            variant_a: {
              cost: 90,
              count: 4,
              price: 2500,
              profit: 2410,
            },
          },
        },
      },
      sold: { whatsapp: { price: 2500 } },
      serviceStatus: { whatsapp: { sellable: true } },
    });
  };

  clearCatalogueCache();
  const catalogue = await fetchCatalogue();

  assert.deepEqual(
    calls.map(({ url }) => url),
    [
      "https://api.example.test/api/prices/status",
      "https://api.example.test/api/prices",
    ],
  );
  assert.equal(calls[1].options.headers.Accept, "application/json");
  assert.deepEqual(
    getServiceOffers(catalogue, "usa", "whatsapp"),
    [
      {
        id: "whatsapp_variant_a",
        label: "Lowest price",
        price: 2500,
        cost: 90,
        count: 4,
        variantId: "variant_a",
        holdHours: null,
      },
    ],
  );
});

test("ACC catalogue waits for the backend warm-up before downloading prices", async () => {
  let statusRequests = 0;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.endsWith("/status")) {
      statusRequests += 1;
      return Response.json({
        ready: statusRequests > 1,
        loading: statusRequests === 1,
      });
    }

    return Response.json({
      countries: {
        usa: {
          whatsapp: {
            available: { cost: 100, count: 1, price: 2500 },
          },
        },
      },
    });
  };

  clearCatalogueCache();
  await fetchCatalogue();

  assert.equal(statusRequests, 2);
  assert.equal(calls.at(-1), "https://api.example.test/api/prices");
});

test.after(() => {
  clearCatalogueCache();
  globalThis.fetch = originalFetch;
  globalThis.__PANDA_API_BASE_URL__ = originalBase;
});
