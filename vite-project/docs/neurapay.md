# NeuraPay bank-transfer funding

The Express API creates NeuraPay virtual accounts and credits a Panda Number
wallet only after the provider confirms a successful transfer. The browser
cannot credit a wallet directly. The backend uses SQLite, so each Render
service must have its own persistent disk mounted at `DATA_DIR`.

## Backend configuration

Set these variables in the backend service environment, never in the frontend
or source control:

- `NEURAPAY_SECRET_KEY`: NeuraPay secret key, sent as a bearer token in the
  `Authorization` header.
- `NEURAPAY_BUSINESS_ID`: merchant ID sent in `X-Business-Id`.
- `NEURAPAY_WEBHOOK_SIGNING_SECRET`: HMAC-SHA256 signing secret for
  `X-NeuraPay-Signature`.
- `NEURAPAY_MODE`: `live` for production or `test` for local/staging.
- `DATA_DIR`: persistent database directory.

The API base is `https://neurapay.com.ng/api/v1`. The server uses
`POST /virtual-accounts` with the Paga channel and
`GET /transactions/{reference}` for provider-side verification. It does not
request BVN or NIN.

For local development, create `vite-project/.env.server` (gitignored and loaded
by `npm run dev`). Add your privately rotated values using these exact names:


dotenv
NEURAPAY_MODE=live
NEURAPAY_SECRET_KEY=np_live_sk_b25a5d99277b5013cc20abc129bbb764
NEURAPAY_BUSINESS_ID=mer_7710331425659347
NEURAPAY_WEBHOOK_SIGNING_SECRET=whsec_8cf2125af06e7092e4a615c0ed050076


Fill those values locally; do not paste them into chat or commit `.env.server`.
The server refuses test credentials on the production Render service. Test
deposits are restricted to `pandanumbers-api-staging`, which has a separate
persistent disk and user database.

## Webhook and settlement

Configure NeuraPay's webhook to:

`https://pandanumbers-api-staging.onrender.com/api/webhooks/neurapay`

Use the production API URL for the live service. NeuraPay signs the raw request
body with HMAC-SHA256. The webhook is acknowledged only after the signature is
checked and the referenced transaction is re-fetched from NeuraPay. The backend
checks the returned reference, transfer type, account number, status, amount,
and currency before atomically crediting the wallet. Pending and failed
transfers never change the balance. Duplicate events and transaction
references are idempotent.

Historical provider records remain in the database for audit. New account
lookups and deposits use NeuraPay. Customers must use only the current account
shown on the Deposit page.

## Staging frontend

Deploy a separate Vercel preview frontend pointed at
`https://pandanumbers-api-staging.onrender.com` with the build-time variable
`VITE_API_BASE_URL`. Use that frontend to register a staging user and view the
account. Do not point the production Vercel frontend at the test service. Set
the staging backend's `FRONTEND_URL` to that preview URL.

The root `render.yaml` defines separate production and staging API services
with separate disks. Configure test credentials only on staging and live
credentials only on production. Never copy production user data into staging.

## Verification

The local contract test uses a mock provider and temporary database; it makes
no live NeuraPay requests:

```powershell
npm test
node scripts/api-neurapay.mjs
npm run build
```

Mock tests do not verify provider account permissions or production
configuration. A sandbox account-creation and test-transfer check requires
rotated test credentials configured privately on the isolated staging service.

Other backend-only settings include `ADMIN_EMAILS`,
`ADMIN_RECONCILE_TOKEN`, and `FRONTEND_URL`. Gmail API password-reset
configuration is unchanged.
