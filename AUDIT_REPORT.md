# Application Reliability Audit

Date: 2026-09-30. Tests use disposable local databases, not club records.

## Verification

- Backend: 65 tests passed (`cd backend && npm test`).
- Frontend: 77 tests passed (`cd frontend && npm test`).
- Chrome: 41 navigation/login/reload checks passed against real local API routes.
- Separate Chrome check: admin manifest/installability, installation event handling,
  and parent manifest selection pass (installation events are simulated).
- Production frontend build and signed Android web-assets bundle completed.
- The browser fixture intentionally contains five previous-cycle classes, three
  current-cycle classes, and a stale linked subscription claiming 8/8. The board
  remains 3/8 when opened, when its player modal loads, and after refresh.

## Feature Coverage

| Area | Checked / repaired |
| --- | --- |
| Login and recovery | Real admin and parent browser login; admin-only recovery, failed-attempt lockout, password changes and session revocation tests; disabled accounts lose existing sessions. |
| Players and profiles | List, add/edit forms and profile render; failed validation no longer changes group counts or parent links; stale edits return conflict instead of overwriting newer data. |
| Subscriptions | Renewal preserves attendance; explicit rollback survives reconciliation/restart; linked counters recalculate; legacy start-date changes create separate history cycles. |
| Attendance | Unique-date counters; old/new cycles, groups and inclusion/exclusion rules; invalid dates rejected; retained history is available; five simultaneous marks create one class and one notification. |
| Payments / DSR | Save/reload while phone delivery stalls; zero balances remain zero; custom DSR entries survive snapshot restore; no repeated summation of historical running balances. |
| Reports / owner summary | All pages render; fixed revenue loader's undefined variable; current player subscriptions count even without linked subscription records; report balance integration tests. |
| Parents | Missing/deleted children and foreign IDs tested; list query filters cannot bypass ownership; duplicate login names rejected on rename; password updates revoke old sessions. |
| Groups | Board grouping, legacy and multiple groups, counters, roster ownership and invalid-save side effects. |
| Coaches | List and profile render; day notes persist through attendance changes and remain restricted to their date. |
| Waiting / data lists | Update/read persistence; list-type changes; browser player screen loads the real endpoints. |
| Packages / programs | Create, update, zero-price and delete tests; changing a package definition does not rewrite existing player packages. |
| Notifications | Recipient-only read state; saved messages; single persistence with independent Web Push/FCM delivery; provider errors, revoked tokens and native session lifecycle tests. Attendance confirmation no longer waits for push delivery. |
| Gallery | Public/admin pages render; activation changes persist and inactive media is excluded publicly. |
| Birthdays | Existing date selection, Amman midnight, leap-day and per-admin acknowledgement tests pass. |
| History / snapshots | Custom DSR restore; restores now record before/after history so subsequent historical views stay accurate; overlapping in-process restores and future targets rejected; linked subscriptions reconciled. |
| Backup | Admin XLSX download generated; parent access denied. |
| Parent app | Dashboard, children, attendance, payments, subscriptions, notifications/detail and settings opened at desktop and 390px mobile widths. |
| Install / cold start | Existing QR routing, APK download progress, failed-download, service-worker navigation and hosting-page rejection tests pass. |
| Android OTA | Signed-bundle, tampering, native-contract mismatch, failed-download and rollback tests pass. Existing signing key configured as an encrypted GitHub Actions secret, never committed. |
| Shared cache | Paginated and compact player lists invalidated; attendance/subscription/board dependencies refreshed; old-account requests rejected after logout instead of refetched as the next account. |

## Ongoing Checks

`Verify Application` runs backend tests, frontend tests and the build on GitHub.
Android OTA publication also requires both test suites to pass.

Optional browser audit: install Playwright outside the production dependencies,
set `PLAYWRIGHT_MODULE` to that installation, then run `npm run test:browser` in
`backend`. Chrome must be installed. It starts and stops its own temporary API,
Vite server and MongoDB. Screenshots/results go to the system temporary folder
`warriors-browser-audit` (or `AUDIT_OUTPUT`).

## Boundaries

- This is regression coverage and a feature audit, not a guarantee of zero bugs.
- No destructive recovery/restore test was run on the production database.
- Real closed-app push receipt, OEM battery restrictions and installed-device
  OTA activation still require physical Android/iPhone acceptance testing.
- Snapshot jobs are in-memory and multi-document writes are not a global
  database transaction. A server crash during restore, simultaneous edits from
  another process, and high-contention group-capacity admission remain outside
  this audit's failure-injection coverage. Restore during a quiet maintenance
  window; the new process-local restore lock is not a distributed lock.
- No native plugin or Android permission changes were made; these web changes
  do not require a new APK for devices already on the compatible OTA build.
