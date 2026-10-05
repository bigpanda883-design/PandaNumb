export const PROVIDER_SOURCES = [
  {
    id: "yankee",
    title: "Source 1",
    description:
      "Choose an app; live inventory is checked after country selection",
    enabled: true,
    purchaseEnabled: true,
    serviceCatalogue: "acc-prices",
  },
  {
    id: "acc-catalogue",
    title: "Source 2",
    description: "Live catalogue prices; number purchasing is not connected",
    enabled: true,
    purchaseEnabled: false,
    serviceCatalogue: "acc-prices",
  },
  {
    id: "additional-source",
    title: "Source 3",
    description: "No provider integration is configured",
    enabled: false,
    purchaseEnabled: false,
    serviceCatalogue: null,
  },
];
