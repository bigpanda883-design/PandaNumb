import { useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiEdit2,
  FiGlobe,
  FiLayers,
  FiPackage,
  FiPower,
  FiRefreshCw,
  FiRotateCcw,
  FiSearch,
  FiTrendingUp,
} from "react-icons/fi";
import {
  bulkUpdateSellingPrice,
  fetchAdminInventory,
  refreshAdminInventory,
  resetSellingPrice,
  setServiceEnabled,
  updateSellingPrice,
} from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import { formatDate, formatNaira, formatNumber } from "./format";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Notice,
  StatCard,
} from "./adminUi";
// Shared admin shell + primitives, then this page's own stylesheet.
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminInventory.css";

/**
 * Numbers Inventory.
 *
 * Country / service / stock / provider cost come from the provider catalogue the
 * server already caches. The selling price is the price Panda Number charges -
 * the administrator can replace it per offer, and the Buy page charges the new
 * price immediately (the server prices every request from its own copy).
 *
 * The provider's cost is READ-ONLY everywhere on this screen.
 */
function InventoryPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [card, setCard] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { loading, error, data, refresh, reload } = useAsyncResource(
    () => fetchAdminInventory({ search: query, country, card, limit: 100 }),
    [country, card, query],
  );

  // Debounced search - one request after typing stops.
  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(timer);
  }, [search, query]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const result = await refreshAdminInventory();
      setNotice({
        tone: "success",
        message: `Inventory refreshed from the provider at ${formatDate(
          result?.provider?.lastFetchedAt,
        )}.`,
      });
      await reload();
    } catch (refreshError) {
      setNotice({
        tone: "error",
        message:
          refreshError?.message ||
          "The provider could not be reached. The last successful refresh is still shown.",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSavePrice = async ({ price }) => {
    await updateSellingPrice({
      countrySlug: editing.countrySlug,
      cardId: editing.cardId,
      variantId: editing.variantId,
      price,
    });
    setEditing(null);
    setNotice({
      tone: "success",
      message: "Selling price saved. The Buy page will charge the new price.",
    });
    await reload();
  };

  const handleReset = async (row) => {
    try {
      await resetSellingPrice({
        countrySlug: row.countrySlug,
        cardId: row.cardId,
        variantId: row.variantId,
      });
      setNotice({
        tone: "success",
        message: "Custom price removed - the automatic rule applies again.",
      });
      await reload();
    } catch (resetError) {
      setNotice({
        tone: "error",
        message: resetError?.message || "Could not reset the price.",
      });
    }
  };

  const handleServiceToggle = async (cardId, sellable) => {
    try {
      await setServiceEnabled({ cardId, sellable });
      setNotice({
        tone: "success",
        message: sellable
          ? "Service enabled - customers can buy it again."
          : "Service disabled - it is no longer available to customers.",
      });
      await reload();
    } catch (toggleError) {
      setNotice({
        tone: "error",
        message: toggleError?.message || "Could not change availability.",
      });
    }
  };

  const rows = data?.items || [];
  const stats = data?.stats;
  const provider = data?.provider;
  const serviceEnabled = rows.length ? rows[0].serviceEnabled : true;

  return (
    <div className="admin-page-body admin-inventory-page">
      {notice ? (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.message}
        </Notice>
      ) : null}

      <div className="admin-stat-grid">
        <StatCard
          icon={FiGlobe}
          label="Countries"
          value={formatNumber(stats?.countries)}
        />
        <StatCard
          icon={FiLayers}
          label="Services"
          value={formatNumber(stats?.services)}
        />
        <StatCard
          icon={FiPackage}
          label="Total stock"
          value={formatNumber(stats?.totalStock)}
          tone="green"
        />
        <StatCard
          icon={FiTrendingUp}
          label="Sellable offers"
          value={formatNumber(stats?.activeServices)}
          hint={`${formatNumber(stats?.customPrices)} custom price(s)`}
          tone="purple"
        />
        <StatCard
          icon={FiAlertTriangle}
          label="Low stock"
          value={formatNumber(stats?.lowStock)}
          hint={`${formatNumber(stats?.outOfStock)} out of stock`}
          tone="orange"
        />
        <StatCard
          icon={provider?.connected ? FiCheckCircle : FiAlertTriangle}
          label="Provider"
          value={provider?.connected ? "Connected" : "Unavailable"}
          hint={
            provider?.lastFetchedAt
              ? `Last fetch ${formatDate(provider.lastFetchedAt)}`
              : "No successful fetch yet"
          }
          tone={provider?.connected ? "green" : "red"}
        />
      </div>

      {provider && !provider.connected ? (
        <Notice tone="error">
          Provider inventory is not live
          {provider.lastError ? ` (${provider.lastError})` : ""}.
          {provider.lastFetchedAt
            ? ` Showing the catalogue fetched at ${formatDate(provider.lastFetchedAt)}.`
            : ""}
        </Notice>
      ) : null}

      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Inventory &amp; selling prices</h2>
            <p>
              Provider cost is read-only. Everything you set here is what the
              customer pays.
            </p>
          </div>
          <div className="admin-panel-tools">
            <label className="admin-search">
              <FiSearch />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search country, service or variant"
                aria-label="Search inventory"
              />
            </label>
            <button
              type="button"
              className="admin-ghost-button"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <FiRefreshCw className={refreshing ? "admin-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh inventory"}
            </button>
            <button
              type="button"
              className="admin-action-button"
              onClick={() => setBulkOpen(true)}
              disabled={!country || !card}
            >
              <FiLayers /> Bulk price
            </button>
          </div>
        </header>

        <div className="admin-filter-grid">
          <label>
            <span>Country</span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="">All countries</option>
              {(data?.countries || []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Service</span>
            <select
              value={card}
              onChange={(event) => setCard(event.target.value)}
            >
              <option value="">All services</option>
              {(data?.services || []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {card ? (
            <div className="admin-service-toggle">
              <span>
                {serviceEnabled
                  ? "Service is on sale"
                  : "Service is switched off"}
              </span>
              <button
                type="button"
                className={`admin-switch${serviceEnabled ? " on" : ""}`}
                onClick={() => handleServiceToggle(card, !serviceEnabled)}
                aria-pressed={serviceEnabled}
              >
                <FiPower />
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !data ? (
          <LoadingState label="Loading provider inventory…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No offers match these filters"
            description="Clear the country or service filter, or refresh the provider inventory."
          />
        ) : (
          <>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Service</th>
                    <th>Provider ID</th>
                    <th>Stock</th>
                    <th>Provider cost</th>
                    <th>Your selling price</th>
                    <th>Profit</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className="admin-row-in"
                      style={{ "--row-index": index }}
                    >
                      <td>
                        <span className="admin-country-cell">
                          {row.countryFlag ? (
                            <img src={row.countryFlag} alt="" loading="lazy" />
                          ) : (
                            <span className="admin-flag-fallback" />
                          )}
                          <strong>{row.countryName}</strong>
                        </span>
                      </td>
                      <td>
                        <strong>{row.service}</strong>
                        <small>{row.variantId}</small>
                      </td>
                      <td>
                        <code className="admin-code">
                          {row.providerService}
                        </code>
                      </td>
                      <td>
                        <span
                          className={`admin-stock ${
                            row.stock <= 0
                              ? "is-out"
                              : row.stock <= 5
                                ? "is-low"
                                : ""
                          }`}
                        >
                          {formatNumber(row.stock)}
                        </span>
                      </td>
                      <td>{formatNaira(row.providerCost)}</td>
                      <td>
                        <strong>{formatNaira(row.sellingPrice)}</strong>
                        {row.customPrice ? (
                          <small className="admin-custom-tag">Custom</small>
                        ) : null}
                      </td>
                      <td>{formatNaira(row.profit)}</td>
                      <td>
                        <span
                          className={`admin-availability ${
                            row.sellable ? "is-on" : "is-off"
                          }`}
                        >
                          {row.sellable
                            ? "Available"
                            : row.serviceEnabled
                              ? "Not profitable"
                              : "Service off"}
                        </span>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="admin-link-button"
                            onClick={() => setEditing(row)}
                          >
                            <FiEdit2 /> Edit price
                          </button>
                          {row.customPrice ? (
                            <button
                              type="button"
                              className="admin-link-button muted"
                              onClick={() => handleReset(row)}
                            >
                              <FiRotateCcw /> Auto
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-table-footnote">
              Showing {rows.length} of {formatNumber(data?.total)} offers.
              Prices update the customer Buy page immediately after saving.
            </p>
          </>
        )}
      </section>

      {editing ? (
        <PriceModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={handleSavePrice}
        />
      ) : null}

      {bulkOpen ? (
        <BulkPriceModal
          countrySlug={country}
          cardId={card}
          countryLabel={
            (data?.countries || []).find((entry) => entry.id === country)
              ?.label || country
          }
          serviceLabel={
            (data?.services || []).find((entry) => entry.id === card)?.label ||
            card
          }
          onClose={() => setBulkOpen(false)}
          onDone={async (message) => {
            setBulkOpen(false);
            setNotice({ tone: "success", message });
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function PriceModal({ row, onClose, onSave }) {
  const [price, setPrice] = useState(String(row.sellingPrice ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const numeric = Number(price);
  const profit = Number.isFinite(numeric) ? numeric - row.providerCost : null;

  const submit = async (event) => {
    event.preventDefault();
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Enter a price greater than zero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ price: numeric });
    } catch (saveError) {
      setError(saveError?.message || "The price could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit selling price" onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <div className="admin-form-readonly">
          <div>
            <span>Country</span>
            <strong>{row.countryName}</strong>
          </div>
          <div>
            <span>Service</span>
            <strong>
              {row.service} · {row.variantId}
            </strong>
          </div>
          <div>
            <span>Provider cost (read-only)</span>
            <strong>{formatNaira(row.providerCost)}</strong>
          </div>
          <div>
            <span>Provider service ID</span>
            <strong>{row.providerService}</strong>
          </div>
        </div>

        <label className="admin-field">
          <span>Current selling price</span>
          <input value={formatNaira(row.sellingPrice)} readOnly disabled />
        </label>

        <label className="admin-field">
          <span>New selling price (₦)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            autoFocus
            required
          />
        </label>

        <div className="admin-profit-preview">
          <span>Estimated profit</span>
          <strong className={profit !== null && profit < 0 ? "is-loss" : ""}>
            {profit === null ? "—" : formatNaira(profit)}
          </strong>
        </div>

        {profit !== null && profit < 0 ? (
          <Notice tone="error">
            This price is below the provider cost, so the offer will be shown as
            unavailable to customers instead of being sold at a loss.
          </Notice>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-ghost-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="admin-action-button"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BulkPriceModal({
  countrySlug,
  cardId,
  countryLabel,
  serviceLabel,
  onClose,
  onDone,
}) {
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const numeric = Number(price);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Enter a price greater than zero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await bulkUpdateSellingPrice({
        countrySlug,
        cardId,
        price: numeric,
      });
      onDone(
        `${result?.saved ?? 0} offer(s) set to ${formatNaira(numeric)}${
          result?.skipped ? `, ${result.skipped} skipped` : ""
        }.`,
      );
    } catch (bulkError) {
      setError(bulkError?.message || "The bulk update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Bulk price update" onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <p className="admin-muted-copy">
          Sets the selling price for every in-stock{" "}
          <strong>{serviceLabel}</strong> offer in{" "}
          <strong>{countryLabel}</strong>. Offers whose provider cost is higher
          than the price are skipped.
        </p>
        <label className="admin-field">
          <span>New selling price (₦)</span>
          <input
            type="number"
            min="1"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            autoFocus
            required
          />
        </label>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-ghost-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="admin-action-button"
            disabled={saving}
          >
            {saving ? "Saving…" : "Apply to all offers"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default InventoryPage;
