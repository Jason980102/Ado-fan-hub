# Reference exchange rates

`GET /api/fx/rates` returns JPY-based USD/TWD reference rates. The mobile app
uses `EXPO_PUBLIC_API_URL` (or the existing analytics API URL fallback), not
the third-party provider directly. Deploy this backend endpoint before updating
the app. The app retains its previous v1 offline rate snapshot during migration.

## Refresh contract

- An independent worker checks due work every 60 seconds, starting after startup.
  Requests can also perform a due refresh. Keep the backend running; a sleeping
  or stopped host cannot run a daily schedule. Resume/request catches up.
- Successful current-day observations are checked hourly. Older observation
  dates are checked every 15 minutes for newly published data. All successful
  cache periods expire at UTC midnight; failures retry after 5 minutes.
- `dates` is the provider's observation date per currency. `checkedAt` and
  `fetchedAt` are the last successful provider response time. `nextCheckAt` is
  the next refresh eligibility time. `stale` means an update failed or is due;
  `awaitingPublication` means an observation date precedes today's UTC date.
  Older observations may be normal on holidays or before publication; they are
  never relabelled with today's date. Different currency dates are preserved.
- A failed or regressing response never replaces the last good snapshot.
  With no saved data, failures return 503 with Retry-After. During a cold
  concurrent refresh, other callers may receive 503 until data is available.
- The app caches backend responses for at most 5 minutes, bounded by the backend
  next check and UTC/local calendar changes. It rechecks while the page is open
  and on foreground/visibility changes. Cancellation is per consumer; concurrent
  app callers share one request. Retry bypasses only the device cache, never
  backend throttling. The provider receives no wishlist or user data.

## Storage and scaling

Set `FX_DB_PATH` to a persistent local SQLite file (default:
`apps/api/data/fx.sqlite3`). All workers **on one host** must share this path.
Atomic database leases deduplicate updates across threads and processes and
recover after 60 seconds if an updater exits. Rate responses are public and
identical for all users; no user-specific rate fetch or authentication is needed.

Separate server hosts with separate files do not share state. Before scaling
across hosts, replace `FxStore` with a shared database/lease implementation
(e.g. PostgreSQL or Redis plus persistent snapshots). Do not place SQLite on a
network filesystem. The provider adapter and service response are separate so
provider or store replacement does not require a mobile API format change.
No distributed database, hosting schedule, or production uptime is provisioned
by this code change. Monitor refresh failures and last successful check in the
deployment. Rates are estimates, not payment settlement quotes.

## Verification

From `apps/api`: `.venv/Scripts/python.exe -B -m unittest test_fx_rates`
From `apps/mobile`: `node scripts/test-budget.cjs`

Provider reference: https://frankfurter.dev/
