# Flutterwave bank-transfer funding

The backend is Express with SQLite (`better-sqlite3`). Configure the API host
with a persistent disk; this project is not a Supabase or Vercel-functions
backend. `DATA_DIR` must point to the mounted persistent volume on the backend
host, otherwise account and deposit records can disappear when the service is
recreated.

## Server configuration

Set these only in the backend service environment, then redeploy:

- `FLW_SECRET_KEY`: a Flutterwave **Secret Key** (`FLWSECK-...` for live).
  Production refuses test keys and malformed values.
- `FLW_WEBHOOK_SECRET_HASH`: the webhook secret hash configured in the
  Flutterwave dashboard.
- `ADMIN_EMAILS`: optional, comma-separated verified account emails permitted
  to use the read-only payment operations dashboard.
- `DATA_DIR`: persistent database directory.

Do not put a secret key, webhook hash, or encryption key in `VITE_*` variables,
the frontend, or this repository. Virtual-account creation and bank-transfer
webhooks do not use `FLW_PUBLIC_KEY` or `FLW_ENCRYPTION_KEY`; this project does
not implement browser card charging.

Configure Flutterwave to send webhook events to:

`https://<backend-host>/api/webhooks/flutterwave`

The webhook endpoint checks the `verif-hash` header and then verifies each
transaction with Flutterwave before any wallet credit. Wallet changes and ledger
rows are committed in the same SQLite transaction. Duplicate event deliveries
and transaction IDs cannot credit twice. No operator endpoint can manually
mark a deposit successful.

## Customer identity and account creation

Flutterwave's permanent NGN account flow requires a customer's BVN or NIN.
Customers enter one identifier on the authenticated Deposit page; BVN/NIN is
not collected during signup. The API sends it to Flutterwave for that request
and does not store or log it. Registration creates an authenticated session
immediately, and the customer's saved profile name, email, and phone are used
for the provider request. Welcome email delivery happens asynchronously and
does not delay signup.

Account creation is idempotent per customer. If the provider times out or the
connection drops during creation, the server leaves setup pending and asks the
customer to contact support rather than retrying an ambiguous request and
potentially creating a second provider account.

The adapter follows Flutterwave's [NGN virtual account documentation](https://developer.flutterwave.com/docs/ngn-virtual-accounts.md):
it sends a unique `tx_ref` with `is_permanent: true`, then stores the provider's
account number, bank name, `order_ref`, and `flw_ref`. The deposit webhook is
validated as documented with `verif-hash`, and transaction verification checks
the provider ID, status, currency, payment method, and the account's exact
`tx_ref` before crediting.

## Deployment and verification

The root `render.yaml` defines the existing Express API as the Render service
`pandanumbers-api`, matching the production frontend's default API URL. It
starts `server/index.js` with Render's injected environment (not the local
`.env.server` file), mounts persistent storage at `/var/data`, and uses
`/api/health` as its deployment health check. Create or update the Render
Blueprint from this repository and enter `FLW_SECRET_KEY` and
`FLW_WEBHOOK_SECRET_HASH` directly in Render when prompted. Never commit those
values. The persistent disk requires Render's Starter plan.

After deployment, verify `https://pandanumbers-api.onrender.com/api/health`
returns JSON with `ok: true`, then check
`https://pandanumbers-api.onrender.com/api/payments/config`. Funding is ready
only when it reports `configured: true`, `missing: []`, and `mode: "live"`.
Configure Flutterwave's webhook URL to
`https://pandanumbers-api.onrender.com/api/webhooks/flutterwave`.

The payment operations page is restricted to administrator accounts. Its
`/api/admin/me` endpoint returns `403 FORBIDDEN` unless the signed-in account's
email is listed in the backend-only `ADMIN_EMAILS` environment variable. Set
`ADMIN_EMAILS` in Render to the exact email address used by the authorized
administrator (multiple addresses may be comma-separated), then redeploy. Do
not remove the API's admin checks or put this setting in a `VITE_*` variable.

This repository can validate the integration against a local provider mock; it
cannot prove that production credentials, business permissions, webhook
configuration, or the live deployment are correct. Verify those in Flutterwave
and Render before enabling real funding.

From `vite-project`, run:

```powershell
npm test
node scripts/api-flutterwave.mjs
npm run build
```

The mock integration test uses a temporary SQLite directory and fake test-only
values. It does not call Flutterwave or touch the development database.
