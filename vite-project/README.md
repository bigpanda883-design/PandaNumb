# Panda Number

Panda Number is a React/Vite client backed by an Express API and SQLite. Wallet
deposits use NeuraPay; number purchases and SMS verification use the existing
Yankee Verify integration.

## Local development

1. Install dependencies with `npm ci`.
2. Create `np_live_pk_f3926aa3089052fef9ef9c4700a84739` using the variable names in
   [`.env.example`](./.env.example). This file is gitignored.
3. For NeuraPay local testing, set `NEURAPAY_MODE=live`,
   `np_live_sk_b25a5d99277b5013cc20abc129bbb764`, `mer_7710331425659347`, and
   `whsec_8cf2125af06e7092e4a615c0ed050076` in `.env.server`. Keep the actual values
   private; never put credentials in the client or commit them.
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
