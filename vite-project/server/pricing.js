function readNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getPricingConfig() {
  return {
    markupPercent: readNonNegativeNumber(
      process.env.NUMBER_PRICE_MARKUP_PERCENT,
      0,
    ),
    feeNaira: readNonNegativeNumber(process.env.NUMBER_PRICE_FEE_NAIRA, 0),
  };
}

/**
 * The naira price we charge for one catalogue variant.
 *
 * @param {number} cost the provider cost from the catalogue
 * @param {{markupPercent?:number, feeNaira?:number}} [config]
 * @returns {number|null} whole naira, or null when the cost is not usable
 */
export function getSellingPrice(cost, config = getPricingConfig()) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return null;

  const markedUp = base * (1 + config.markupPercent / 100);
  return Math.ceil(markedUp + config.feeNaira);
}
