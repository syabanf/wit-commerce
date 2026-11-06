# Binaries

The API image holds four binaries built from this module. They share one Postgres database, and
`api` owns the schema: it migrates and seeds, and the others only connect.

| Binary | Port | Serves |
| --- | --- | --- |
| `api` | 8090 | Everything under `/api/v1`, the timer tick and webhook delivery. |
| `ai` | 8091 | `POST /api/v1/shop/{store}/ai/chat` and `GET /health`. |
| `notifier` | 8092 | Sends the queued email in `email_outbox`; `GET /health` reports the queue. |
| `shop` | 8093 | `GET /api/v1/shop`, `/shop/{store}/state`, `/shop/{store}/events` and `/health`. |

`api` alone runs the whole product. The other three take load off it and are off by default:
`scripts/deploy-prod.sh` starts them and routes traffic to them when `SPLIT_SERVICES=true`.

## What changes with SPLIT_SERVICES=true

- Compose starts the `split` profile: `ai`, `notifier` and `shop`.
- The API gets `EVENTS_NOTIFY=true`: every delta also goes out on the Postgres channel
  `commerce_events`, so `shop` streams see changes made through `api`. A change over the
  8000-byte NOTIFY limit goes into `event_log`, and the notification carries its id.
- The API gets `NOTIFIER_EXTERNAL=true` and stops draining `email_outbox` itself.
- nginx sends the AI chat path to `ai`, and GET requests on the three public shop paths to
  `shop`. Every other method and path stays on `api`.

Turning it off again is safe: `api` serves every route either way.

## Known limits

- Rate limits for the AI chat live in each process's memory: 30 a minute per shopper IP and 300 a
  minute in total. Each replica of `ai` allows that much on its own.
- A `shop` stream misses changes sent while its LISTEN connection reconnects, or while the API's
  notify queue is full. Shoppers see them on the next reload.
- Email is sent at least once. A send cut off by a restart can arrive twice.
- Forgot-password and confirmation emails wait for the next drain, up to 2 seconds. Staff
  invitations and admin resets still send at once, because the admin sees the result.
- Sent `email_outbox` rows are kept without their body; nothing prunes them yet.

Every binary reads `.env` in its working directory for development runs; real environment
variables win.

## Midtrans sandbox

A brand that saves Midtrans keys collects real payments at checkout. A brand without keys keeps the
simulated checkout: non-COD orders are placed paid.

How it runs: the API places a Midtrans order `pending` whatever the browser sent, creates a Snap
transaction (order id as `order_id`, the order total as `gross_amount`) and answers with its
`redirectUrl`. The storefront sends the shopper there. Midtrans posts to the notification URL; the
API checks the signature, asks Midtrans for the status, and marks the order paid on `settlement` or
an accepted `capture`, or cancels it on `expire`, `cancel` or `deny`. The order page shows Pay now
while the order waits, and turns paid over the store's event stream when the notification lands.
The admin's order page shows the Midtrans status, transaction id and last notification time.

To test by hand:

1. Sign in to the Midtrans dashboard in sandbox mode and copy the server key and client key from
   Settings → Access Keys. Sandbox keys start with `SB-`.
2. In the admin, open Settings → App marketplace, pick the brand, open Midtrans, paste both keys and
   save. Turn the integration on, then press Test connection: it should say Midtrans accepted them.
3. In the Midtrans dashboard, set Settings → Configuration → Payment Notification URL to
   `{PUBLIC_URL}/api/v1/payments/midtrans/notification`. Midtrans must reach that address over
   HTTPS, so a laptop needs a tunnel such as `cloudflared tunnel --url http://localhost:8787`.
4. Set `PUBLIC_URL` on the API, so Midtrans sends the shopper back to
   `{PUBLIC_URL}/shop/{store}/order/{id}`. Without it the API uses the request's `Origin` when it is
   in `ALLOWED_ORIGINS`, which suits a storefront served at the root in development.
5. Check out on that brand's storefront with QRIS, a virtual account, GoPay or a card. The
   storefront opens the Snap page.
6. Pay with Midtrans's sandbox tools:
   - Card: `4811 1111 1111 1114`, any future expiry, CVV `123`, OTP `112233` (accepted). A card
     ending `1112` with the same details is denied.
   - Virtual account, QRIS and GoPay: open the Midtrans simulator at
     `https://simulator.sandbox.midtrans.com`, pick the method, paste the VA number or QR link the
     Snap page shows and pay.
7. Watch the order page turn paid without a reload, and the admin order page show `settlement`
   with the transaction id. Midtrans's dashboard lists the notification under Transactions.
8. To test expiry, leave a VA unpaid; Midtrans sends `expire` when it lapses (24 hours by default)
   and the order is cancelled. The API's own timer cancels it after 24 hours too.

The notification is safe to repeat: a second `settlement` changes nothing, and a notification with a
bad signature answers 401 and changes nothing.
