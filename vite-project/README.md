# Panda Number

Panda Number is a React/Vite client backed by an Express API and SQLite. Wallet
deposits use NeuraPay; number purchases and SMS verification use the existing
Yankee Verify integration.

Authentication is handled by the API. Browser session credentials and the
display profile are scoped to the current tab; user accounts are not created
offline in localStorage.

## Local development

1. Install dependencies with `npm ci`.
2. Create `.env.server` using the variable names in [`.env.example`](./.env.example).
3. For NeuraPay testing, configure `NEURAPAY_MODE` and your server-only
   credentials in `.env.server`. Use provider test credentials for test mode.
   Never put credentials in the client or commit them.
4. Run `npm run dev` to start the API and Vite together. Stop that process with
   Ctrl+C before starting it again.

Check `http://localhost:8787/api/payments/config` to confirm which provider
the local API is serving and which settings are missing. The NeuraPay webhook
route is `/api/webhooks/neurapay`.

The local NeuraPay contract test uses a mock provider and does not make live
requests:

```powershell
node scripts/api-neurapay.mjs
npm live
npm run lint
npm run build
```

See [`docs/neurapay.md`](./docs/neurapay.md) for staging, production, webhook,
and settlement configuration.
