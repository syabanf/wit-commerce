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
