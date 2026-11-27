import { useState } from "react";
import {
  FiBell,
  FiCheckCircle,
  FiClock,
  FiEdit3,
  FiFileText,
  FiSend,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import {
  deleteAnnouncement,
  fetchAdminAnnouncements,
  fetchAnnouncementAudience,
  saveAnnouncement,
  updateAnnouncement,
} from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import { formatDate, formatNumber } from "./format";
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
import "../../CSS/dashboard/admin/AdminAnnouncements.css";

const MAX_BODY = 2000;

const AUDIENCE_OPTIONS = [
  { id: "all", label: "All registered customers" },
  { id: "active", label: "Customers active in the last 24 hours" },
  { id: "selected", label: "Selected customers" },
];

/**
 * Announcements.
 *
 * Writing a message and pressing "Send to all users" creates one notification
 * per recipient in the database, which is what appears on each customer's
 * Notifications page. The result shown afterwards reports what the backend
 * actually created - never a pretend "delivered" count.
 */
function AnnouncementsPage() {
  const [notice, setNotice] = useState(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [draftId, setDraftId] = useState(null);

  const [confirming, setConfirming] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const { loading, error, data, refresh, reload } =
    useAsyncResource(async () => {
      const [announcements, audienceCounts] = await Promise.all([
        fetchAdminAnnouncements({ limit: 50 }),
        fetchAnnouncementAudience(),
      ]);
      return { list: announcements, audience: audienceCounts };
    }, []);

  const list = data?.list || null;
  const audience = data?.audience || null;

  const recipientCount =
    target === "all"
      ? (audience?.all?.count ?? 0)
      : target === "active"
        ? (audience?.active?.count ?? 0)
        : (audience?.selected?.count ?? 0);

  const resetComposer = () => {
    setTitle("");
    setBody("");
    setTarget("all");
    setDraftId(null);
  };

  const saveDraft = async () => {
    if (!title.trim()) {
      setNotice({
        tone: "error",
        message: "Give the announcement a title first.",
      });
      return;
    }
    try {
      if (draftId) {
        await updateAnnouncement(draftId, { title, body, audience: target });
      } else {
        const saved = await saveAnnouncement({
          title,
          body,
          audience: target,
          send: false,
        });
        setDraftId(saved?.announcement?.id || null);
      }
      setNotice({ tone: "success", message: "Draft saved." });
      await reload();
    } catch (saveError) {
      setNotice({
        tone: "error",
        message: saveError?.message || "The draft could not be saved.",
      });
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const response = await saveAnnouncement({
        title,
        body,
        audience: target,
        send: true,
      });
      // The draft was only ever a staging copy of this message - the sent
      // announcement now owns the record. Removed on a best-effort basis so a
      // failure to tidy up cannot hide a successful send.
      if (draftId) {
        await deleteAnnouncement(draftId).catch(() => {});
      }
      setConfirming(false);
      setResult(response?.delivery || null);
      resetComposer();
      await reload();
    } catch (sendError) {
      setConfirming(false);
      setNotice({
        tone: "error",
        message:
          sendError?.message ||
          "The announcement was not sent. Nothing was created - please try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const removeDraft = async (item) => {
    try {
      await deleteAnnouncement(item.id);
      setNotice({ tone: "success", message: "Draft deleted." });
      if (draftId === item.id) resetComposer();
      await reload();
    } catch (removeError) {
      setNotice({
        tone: "error",
        message: removeError?.message || "The draft could not be deleted.",
      });
    }
  };

  const editDraft = (item) => {
    setDraftId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setTarget(item.audience || "all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stats = list?.stats;

  return (
    <div className="admin-page-body admin-announcements-page">
      {notice ? (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.message}
        </Notice>
      ) : null}

      <div className="admin-stat-grid">
        <StatCard
          icon={FiBell}
          label="Total announcements"
          value={formatNumber(stats?.total)}
        />
        <StatCard
          icon={FiCheckCircle}
          label="Sent announcements"
          value={formatNumber(stats?.sent)}
          hint={`${formatNumber(stats?.messagesSent)} notifications created`}
          tone="green"
        />
        <StatCard
          icon={FiClock}
          label="Scheduled"
          value={formatNumber(stats?.scheduled)}
          tone="orange"
        />
        <StatCard
          icon={FiFileText}
          label="Drafts"
          value={formatNumber(stats?.draft)}
          tone="purple"
        />
      </div>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>{draftId ? "Edit draft" : "Write an announcement"}</h2>
            <p>
              Customers see this on their Notifications page the moment it is
              sent.
            </p>
          </div>
        </header>

        <div className="admin-composer">
          <label className="admin-field">
            <span>Message title</span>
            <input
              value={title}
              maxLength={140}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Important Panda Number update"
            />
          </label>

          <label className="admin-field">
            <span>Message body</span>
            <textarea
              value={body}
              rows={7}
              maxLength={MAX_BODY}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Welcome to Panda Number! We have made improvements to our platform…"
            />
            <small className="admin-counter">
              {body.length}/{MAX_BODY} characters
            </small>
          </label>

          <label className="admin-field">
            <span>Recipients</span>
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              {AUDIENCE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {target === "selected" ? (
            <Notice tone="info">
              Selecting individual customers is not available yet, so no
              recipients can be chosen here. Send to all customers, or use the
              active-customer audience.
            </Notice>
          ) : null}

          <div className="admin-composer-actions">
            <button
              type="button"
              className="admin-ghost-button"
              onClick={() => setPreviewing(true)}
              disabled={!title.trim() && !body.trim()}
            >
              Preview
            </button>
            <button
              type="button"
              className="admin-ghost-button"
              onClick={saveDraft}
            >
              {draftId ? "Update draft" : "Save draft"}
            </button>
            <button
              type="button"
              className="admin-action-button"
              onClick={() => setConfirming(true)}
              disabled={!title.trim() || !body.trim() || target === "selected"}
            >
              <FiSend /> Send to all users
            </button>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Announcement history</h2>
            <p>Sent messages are kept as a record and cannot be deleted.</p>
          </div>
        </header>

        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !list ? (
          <LoadingState label="Loading announcements…" />
        ) : !list?.items?.length ? (
          <EmptyState
            title="No announcements yet"
            description="Write your first message above and send it to every customer."
          />
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Announcement</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th>Recipients</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      <small>
                        {item.body.slice(0, 90)}
                        {item.body.length > 90 ? "…" : ""}
                      </small>
                    </td>
                    <td>{audienceLabel(item.audience)}</td>
                    <td>
                      <span className={`admin-status-tag is-${item.status}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      {item.status === "sent" ? (
                        <>
                          <strong>{formatNumber(item.createdCount)}</strong>
                          <small>
                            of {formatNumber(item.recipientCount)} created
                            {item.failedCount
                              ? ` · ${item.failedCount} failed`
                              : ""}
                          </small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatDate(item.sentAt || item.createdAt)}</td>
                    <td>
                      {item.status === "draft" ? (
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="admin-link-button"
                            onClick={() => editDraft(item)}
                          >
                            <FiEdit3 /> Edit
                          </button>
                          <button
                            type="button"
                            className="admin-link-button danger"
                            onClick={() => removeDraft(item)}
                          >
                            <FiTrash2 /> Delete
                          </button>
                        </div>
                      ) : (
                        <span className="admin-muted-copy">Sent</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirming ? (
        <Modal
          title="Confirm send"
          onClose={() => (sending ? null : setConfirming(false))}
        >
          <div className="admin-confirm">
            <p>
              You are about to send <strong>{title}</strong> to{" "}
              <strong>{formatNumber(recipientCount)}</strong> customer
              {recipientCount === 1 ? "" : "s"}.
            </p>
            <p className="admin-muted-copy">
              A notification is created for each recipient and appears on their
              Notifications page. This cannot be undone.
            </p>
            <div className="admin-form-actions">
              <button
                type="button"
                className="admin-ghost-button"
                onClick={() => setConfirming(false)}
                disabled={sending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-action-button"
                onClick={send}
                disabled={sending}
              >
                <FiSend /> {sending ? "Sending…" : "Confirm and send"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {previewing ? (
        <Modal title="Customer preview" onClose={() => setPreviewing(false)}>
          <div className="admin-preview-card">
            <span className="admin-preview-tag">
              <FiUsers /> Announcement
            </span>
            <h3>{title || "Untitled announcement"}</h3>
            <p>{body || "No message body yet."}</p>
            <small>{formatDate(new Date())}</small>
          </div>
        </Modal>
      ) : null}

      {result ? (
        <Modal title="Announcement sent" onClose={() => setResult(null)}>
          <div className="admin-delivery-result">
            <div>
              <span>Intended recipients</span>
              <strong>{formatNumber(result.recipientCount)}</strong>
            </div>
            <div>
              <span>Notifications created</span>
              <strong className="is-success">
                {formatNumber(result.created)}
              </strong>
            </div>
            <div>
              <span>Failed</span>
              <strong className={result.failed ? "is-loss" : ""}>
                {formatNumber(result.failed)}
              </strong>
            </div>
            <div>
              <span>Sent at</span>
              <strong>{formatDate(result.sentAt)}</strong>
            </div>
            <p className="admin-muted-copy">
              Created means the notification is stored and waiting on each
              customer&apos;s Notifications page. It does not mean the customer
              has opened it - reads are tracked separately.
            </p>
            <div className="admin-form-actions">
              <button
                type="button"
                className="admin-action-button"
                onClick={() => setResult(null)}
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function audienceLabel(value) {
  return AUDIENCE_OPTIONS.find((option) => option.id === value)?.label || value;
}

export default AnnouncementsPage;
