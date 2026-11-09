/**
 * Business rules for wallet funding that do NOT depend on the provider.
 *
 * Kept in its own file because the old payment adapter used to own these and
 * routing should not import a provider module just to read a bound. The Deposit
 * page receives the same numbers from /api/payments/config; the server validates
 * against THIS object, never against a value from the browser.
 */
export const DEPOSIT_LIMITS = {
  /** Smallest transfer worth crediting (naira). */
  minimum: Number(process.env.MIN_DEPOSIT_NAIRA || 100),
  /** Largest amount a single transfer is expected to be (naira). */
  maximum: Number(process.env.MAX_DEPOSIT_NAIRA || 500000),
  /** NGN virtual-account funding. */
  currency: "NGN",
};
