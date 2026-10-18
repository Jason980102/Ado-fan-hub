# Current merchandise, history and restock alerts

## Implemented behavior

- `/shop` shows a separate list of sold-out current products **after the theme
  blocks and before the final official-site link**. It is not inside a theme
  block and is hidden while browsing historical themes or a theme's products.
- `GET /api/shop/sold-out?page=1` loads every page of active campaigns on the
  server, then paginates sold-out rows (24/page). Catalogue observations are
  shared for 10 minutes per API process. Stale fallback is labelled and never
  used to confirm a subscription or trigger a push.
- The button is product-level, opt-in and one-shot: any variant becoming
  available can trigger one alert. It does not promise the user's preferred
  size. No permissions are requested on startup. Subscription success is
  shown only after the backend accepts it. Unconfigured push is reported as
  unavailable, never as enabled.
- Campaign deadlines apply independently of stock caches. Current themes move
  into the history view; last-seen theme metadata is stored so disappearing
  official listings do not erase the app's historical theme record.
- Wishlist entries retain title, options, quantity, price and image after
  expiry and show Sales ended. This status is terminal for the saved entry;
  missing source metadata never changes it back to active or deletes it.
  Legacy entries synchronize campaign status on focus, periodically and on
  foreground. Saved deadlines work offline. Unknown campaigns remain unknown.
  Explicit user removal remains available. Status synchronization serializes
  with quantity edits, additions and removals.

## Backend API and delivery

- `GET /api/shop/campaign-status?slugs=Pusheen,Other` works even if a theme is
  no longer in the official listing. Verified campaign windows currently come
  from `shop_campaigns.py`; verifying new campaigns is still a separate task.
- `GET /api/push/config` advertises availability and the configured EAS project.
- `PUT /api/push/devices/{id}` registers/rotates an Expo push token. A random
  installation ID and 256-bit bearer secret stored in native SecureStore own
  that device; only the secret hash is stored on the backend. There is no
  account system or cross-device subscription sync in this feature.
- `GET/PUT /api/push/devices/{id}/subscriptions` reads/changes only that device's
  subscriptions. DELETE on the device disables its subscriptions. Revoking OS
  permission deactivates the device on the next foreground synchronization.
- Subscribe only to fresh current sold-out products, at most 100 per device.
  Device registrations/rotations are limited to 30 successful requests per
  source IP per hour; subscription changes to 120/device/hour. Use HTTPS
  outside localhost. Deployment must also enforce trusted-proxy configuration,
  request limits and rate limits at the edge, especially for shared-IP users.
- An independent monitor runs every minute, using shared catalogue data.
  Persisted, unique outbox jobs avoid repeated alerts for unchanged availability.
  Failed sends back off, up to 8 attempts; current availability is checked again
  before retry. Campaign expiry cancels subscriptions and pending sends.
- Expo tickets are stored, then receipts are checked after 15 minutes. Invalid
  devices are disabled. Accepted tickets do not prove delivery to a phone;
  successful receipts mean handoff to FCM/APNs. Transport timeout retries and
  the push services can rarely duplicate delivery; exactly-once delivery is not
  guaranteed. Already handed-off messages cannot be recalled by cancellation.
- Up to 100 sends/receipt checks are processed per minute. Monitor backlog and
  move to a rate-controlled queue before a large simultaneous release. The
  database lease avoids workers sending concurrently on one shared local file.
  A catalogue refresh that exceeds the lease is not allowed to send afterward.

## Configuration — NOT created by this change

The user has not created EAS/Firebase yet. Push remains disabled by default.
No account, Firebase project, credentials, cloud build or real notification
was created/sent during development. Web push is a separate service-worker and
VAPID integration; this feature uses Android/iOS Expo Push only.

1. Create an Expo/EAS project under the owner's account, choose the app's final
   Android application ID, and configure a matching Firebase Android app/FCM v1.
2. Provide `EXPO_PUBLIC_EAS_PROJECT_ID`, `ANDROID_APPLICATION_ID`, and
   `GOOGLE_SERVICES_JSON` (path to the local/EAS-provided Firebase config file)
   for app builds. `app.config.ts` reads these without inventing IDs. Native
   plugins for notifications and SecureStore are already included.
3. Upload FCM v1 service-account credentials through the owner's EAS credential
   workflow. Do not put service-account private keys in source or client env.
   Future iOS builds need the owner's Apple/APNs setup separately.
4. Build an installed Android preview APK using the `preview` EAS profile
   (internal standalone build), or a suitable development build. Android remote
   notifications do not work in Expo Go. This change does not start a build.
5. Deploy the backend with persistent local `SHOP_DB_PATH` (default:
   `apps/api/data/shop-state.sqlite3`), `EXPO_PUSH_PROJECT_ID` matching the app,
   and `PUSH_ENABLED=1` only after credentials and physical-device testing.
   Enable Expo enhanced push security and provide `EXPO_ACCESS_TOKEN` only to
   the backend when using that mode. No secrets belong in `EXPO_PUBLIC_*`.
6. Point `EXPO_PUBLIC_API_URL` at the deployed HTTPS API; deploy API before app.
   Keep the backend running for monitoring. Sleeping hosts cannot monitor.

SQLite supports multiple processes sharing a persistent local file on one
host. Separate hosts need a shared database/lease/queue implementation; do not
place SQLite on a network filesystem. Protect the database (it contains push
tokens), back it up, and monitor failed receipts, backlog and source freshness.
Long-term device/token cleanup and retention policies belong to deployment
operations and should be set before opening unrestricted public registration.

## Tests

From `apps/api`: `.venv/Scripts/python.exe -B -m unittest test_shop_restock`
From `apps/mobile`: `node scripts/test-shop-restock.cjs`
Tests use mocked push transport and temporary databases; no real pushes.

Official documentation:
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- https://docs.expo.dev/push-notifications/push-notifications-setup/
- https://docs.expo.dev/push-notifications/sending-notifications/
