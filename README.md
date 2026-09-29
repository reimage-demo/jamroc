# Jam Roc Restaurant & Lounge

Public HTML/CSS/browser JavaScript, a separate Vite/React staff portal, and a shared root-level Convex backend. Architecture follows the local Patio project; Jam Roc has its own deployment, credentials, assets, and data.

## Repositories and local structure

- Root: `jamroc` repository; public pages, assets, Convex, tests, scripts.
- `admin-portal/`: independent `jamroc-admin` repository, excluded from the root repository.
- Each repository publishes only built browser assets to its own `gh-pages` branch. After building, run `node scripts/publish-pages.mjs` and `node scripts/publish-pages.mjs --admin` from the root to publish updates.
- Public: https://reimage-demo.github.io/jamroc/
- Staff: https://reimage-demo.github.io/jamroc-admin/

The staff repository builds independently. It does not import root Convex source or generated bindings; it uses Convex function names through `anyApi`, matching Patio's separate-repository approach.

## Development

Run `npm ci` at the root and separately in `admin-portal/`.

- `npm run public:build` bundles the public Convex client and copies an allowlist of files into `dist/`.
- `npm run dev` serves `dist/` at http://127.0.0.1:4173.
- `npm run admin:dev` starts Vite on http://127.0.0.1:5177.
- `npm run convex:dev` watches the separate Jam Roc development backend.
- `npm run check` runs TypeScript, security/behavior tests, builds, and asset/performance checks.
- `npm run images:optimize` compresses locally retained image-generation originals into WebP assets. Originals are not committed.

The public connection URL is in `public-config.js`. Admin connection URLs are local `.env` files; see `admin-portal/.env.example`. These frontend variables contain no credentials. A production Vite build requires `VITE_CONVEX_URL` and `VITE_PUBLIC_SITE_URL`.

## Menu and preview state

33 food entries were transcribed from the supplied menu photograph. Rice choices are separate entries; Whole Red Snapper has three preparation options. There are 35 generated food images. Five empty drink sections are seeded: Cocktails, Spirits, Beer, Wine, Non-Alcoholic. Food descriptions and photography are illustrative.

Seeded items are drafts with no price. `MENU_PREVIEW_ENABLED=true` makes drafts visible as a clearly labeled public preview while setup is underway. Admin edits appear in this preview. Before live ordering, review descriptions and images, set prices, publish approved items, and set `MENU_PREVIEW_ENABLED=false`. Normal public queries then include published items only.

Online ordering is disabled at both the configuration and UI levels. No local customer checkout or fake order-submission endpoint exists. The optional “Your picks” list is only a browser-local browsing aid and does not transfer to Toast.

## Roles and security

The administrator is `jamrocadmin`; the supplied password was provisioned without a backslash. No plaintext password is stored in code or files. Passwords use scrypt with individual random salts and a server-only pepper. Session tokens are random and only their SHA-256 hashes are stored. Sessions expire after 12 hours. Five unsuccessful sign-in attempts lock the account. Development and production use independent secrets.

Employees can read order details and move Preparing → Ready → Collected, or return Ready to Preparing. Only admins can edit menus/settings, manage staff, or cancel a board entry. Canceling a board entry is not a Toast cancellation or refund. Status changes record the acting user. Disabled accounts immediately lose access.

Customer first names and preparation notes are stored as AES-256-GCM ciphertext with unique nonces and versioned authenticated context. Public order subscriptions expose only IDs, order numbers, status, and timestamps. A server action decrypts only active first names for the intentionally public pickup board. Staff-only actions return names and notes. Full customer contact information and payment-card data are not retained.

Secrets are configured only in Convex. `.env.security.dev` and `.env.security.prod` are ignored local backups with mode 0600. Keep the encryption key backed up: replacing it without migration makes existing records unreadable. Do not rotate it by overwriting the environment variable.

To unlock an account from an authorized terminal:

```sh
npx convex run auth:unlock '{"username":"jamrocadmin"}' --prod
```

Admins create or reset individual employee accounts in Employees. No shared default employee password is created.

## Toast activation (pending credentials)

Use Toast-hosted ordering and payment. Orders already go to the restaurant's configured Toast POS. The Jam Roc employee portal changes only Jam Roc's pickup-board state; it does not write status, refunds, or cancellations to Toast.

Server environment variables required:

```text
TOAST_ENABLED=false
TOAST_CLIENT_ID=
TOAST_CLIENT_SECRET=
TOAST_RESTAURANT_GUID=
TOAST_WEBHOOK_SECRET=
TOAST_API_BASE_URL=https://ws-api.toasttab.com
TOAST_PICKUP_DINING_OPTION_GUIDS=
TOAST_ORDER_SOURCES=Online,Branded Online Ordering
MENU_PREVIEW_ENABLED=true
```

The webhook URL is:

`https://scintillating-retriever-998.convex.site/toast/webhook`

1. Obtain Full Standard API access, `orders:read` and `guest.pi:read`, and an Orders webhook subscription for this location. Obtain the restaurant's Toast-hosted ordering URL and pickup dining-option GUIDs.
2. Configure the secrets in Convex. Confirm actual order source values and pickup GUIDs from this merchant's payloads; do not broaden to every dining option.
3. Confirm Toast signature verification against a real sandbox/test webhook. The signature is base64 HMAC-SHA256 of the exact raw body concatenated with its timestamp, using the subscription secret.
4. Test an approved, paid pickup order end to end. Confirm name retrieval, items/modifiers, order number, payment/refund fields, and the actual POS ticket. Confirm scheduled-order behavior before enabling future scheduling; the importer excludes orders more than one hour from fulfillment.
5. Verify duplicate and delayed events, invalid signatures, wrong locations, partial payment, refund/void, API timeout retries, and employee Ready/Collected changes. Imported orders are deduplicated by Toast GUID; events are deduplicated by event GUID. Later Toast changes preserve local pickup status, except refunds/voids cancel the board entry.
6. Publish approved food/drinks and turn preview mode off. Set `TOAST_ENABLED=true` only after the integration is verified, then enable ordering in Admin Settings with the Toast URL.

The importer retrieves authoritative order details on each signed event and retries failed requests five times. Admin Settings shows recent import failures. Backend `toast:retryImport` allows authorized admin retries. Missed-event reconciliation and any merchant-specific mapping adjustments must be validated during activation; webhook availability alone is not a production acceptance test.

Pushover remains deferred until requested credentials are available. No notifications are sent by this build.

## Validation and budgets

Security/behavior tests cover encryption/tampering, salt and pepper, role boundaries, lockout, revoked sessions, order transitions, audit attribution, duplicate orders, menu seeding, and checkout gating. Real Toast checkout testing is pending its credentials.

Budgets: logo ≤80 KB, menu image ≤350 KB, public client ≤30 KB gzip, combined admin JS ≤90 KB gzip. Image uploads are optimized before storage (500 KB maximum), with backend type/size validation. Images below the fold lazy-load and reserve dimensions; the hero is eager-loaded. Convex subscriptions replace periodic polling.

See `IMAGE_PROMPTS.md` for the built-in image-generation prompts and final asset mapping.

## 50-order concurrency target

The application targets at least 50 simultaneous active pickup orders. Active orders are queried by status separately from completed history, so 250 newer collected orders cannot push the active queue off either board. Queries allow up to 200 preparing and 200 ready orders; staff views include these plus recent history.

Toast webhook events are persisted before acknowledgment, deduplicated, and scheduled at 250 ms intervals (four imports per second nominally). A 50-event burst is queued instead of issuing 50 outbound API requests together. Token refresh uses one database lease; the encrypted token is reused until near expiry. Authentication failures cannot trigger an authentication storm. HTTP 429 responses pause new import work using Toast's Retry-After interval. Processing latency depends on Toast responses and scheduler availability, not just slot timing.

The capacity suite uses simulated Toast responses and tests 50 unique orders plus duplicate deliveries, one authentication request, 50 concurrent board reads, 50 Ready updates, 50 Collected updates, private-name decryption, and preservation of active orders behind 250 historical records. These are application tests, not a measured production SLA or a live Toast payment/POS load test. The latter remains an activation requirement once credentials are available.

Public name requests are coalesced during bursts and cached in memory, so status-only changes do not repeat the name-decryption action for every connected customer.

References: [Toast rate limits](https://doc.toasttab.com/doc/devguide/apiRateLimiting.html), [authentication-token reuse](https://doc.toasttab.com/doc/devguide/apiAuthenticationRateLimit.html).

A separate live development-backend probe also passed on September 29, 2026: 50 concurrent webhook enqueue operations, 50 order writes, 50 parallel board reads, and 100 employee status updates completed successfully in one run. The measured backend sequence took 2.406 seconds; this excludes Toast requests, customer payment time, and browser rendering and is not a production latency guarantee. The probe used temporary encrypted test orders and removed its data, employee session, and temporary probe functions afterward. No production order records were created.
