# Aera data lifecycle runbook

## Deployment order

1. Back up PostgreSQL and verify the latest restore drill.
2. Deploy migration `20260720110000_data_lifecycle_exports` with
   `npm run db:predeploy`. Do not enable the new UI before the migration is
   present: authentication reads `User.accountStatus` on every request.
3. Deploy the web service, then the Railway cron service. The shared runner
   must call `POST /api/cron/lifecycle` every five minutes with the same
   `CRON_SECRET` as the web service.
4. Call `GET /api/cron/status` with the bearer secret. `lifecycle` must have a
   recent heartbeat and the lifecycle backlog must be visible.

## Export contract

- Community owners download `/api/tenant/:slug/export`. ACTIVE and DELETING
  communities are supported so an owner can take a final copy.
- A signed-in user downloads `/api/account/export` from account settings.
- JSON uses schema version `2026-07-20.1`, a manifest, keyset-paginated
  datasets and final per-dataset counts. Responses are streamed and `no-store`.
- API-key hashes, webhook signing secrets, unsubscribe bearer URLs, password
  hashes, TOTP secrets and push credentials are excluded. Stripe's privileged
  webhook inbox is explicitly listed as an excluded operational dataset.
- Tenant queries use both the `aera_app` RLS context and an explicit
  `tenantId` predicate. User exports use fixed, reviewed predicates for the
  authenticated user id. `LegalAcceptance` and every newsletter consent,
  delivery and suppression model are represented in the appropriate export.

## Deletion state machine

`BILLING -> RETENTION -> OBJECT_DISCOVERY -> OBJECT_DELETION -> DATABASE`

- Community requests atomically set `Tenant.status=DELETING` and create a
  `DataDeletionJob`. The community row remains intact while Stripe, S3 or the
  database is unavailable.
- Account requests atomically set `User.accountStatus=DELETING`, revoke all
  sessions, and queue the job. The worker cancels Stripe subscriptions before
  removing access. Accounts that own active communities or have pending
  payments/reservations are rejected before queuing.
- Financial snapshots are minimised, subject identifiers are HMAC-pseudonymised
  and retained for ten years. Tenant audit rows receive a pseudonymous scope
  and a two-year retention date before the tenant foreign key is removed.
- S3 keys from both `StorageObject` and `StorageUploadReservation` enter the
  durable `ObjectDeletionTask` outbox. A full tenant-prefix scan catches rows
  missing from PostgreSQL. Physical deletion is idempotent and retried before
  the database cascade is allowed.
- Active tenant prefixes are reconciled incrementally. Only unreferenced S3
  objects older than 24 hours are queued, preventing in-flight uploads from
  being removed.
- User deletion keeps a non-authenticating pseudonymous tombstone where
  financial/content foreign keys require one. Newsletter delivery/consent
  PII is removed; `LegalAcceptance` remains linked only to that tombstone as
  contract evidence.
- Every lifecycle run deletes bounded pages of expired billing-retention and
  detached audit records. Completed object tasks are retained for 30 days and
  completed deletion jobs for 90 days for operational evidence, then purged.

## Monitoring and recovery

- Alert on a stale/failed `lifecycle` heartbeat, any `BLOCKED` deletion job,
  any `EXHAUSTED` object task, or a growing lifecycle backlog.
- Inspect `DataDeletionJob.phase`, `lastError`, `attempts` and `counters`.
  Error messages are sanitised and must not be replaced with raw provider
  payloads.
- Fix the external cause first (active Stripe subscription, Connect balance,
  S3 credentials, database availability). To retry a reviewed blocked job:

  ```sql
  UPDATE "DataDeletionJob"
  SET status = 'RETRYING', attempts = 0, "nextAttemptAt" = NOW(),
      "leaseUntil" = NULL, "lastError" = NULL
  WHERE id = '<reviewed-job-id>' AND status = 'BLOCKED';
  ```

- For an exhausted object task, verify its exact bucket/key and reset only
  that reviewed row to `RETRYING`. Never skip `OBJECT_DELETION` or manually
  delete the Tenant row: doing so defeats the external-cleanup boundary.
- A completed Stripe Connect deletion is safe to retry; Stripe's
  `resource_missing` response is treated as success. S3 object deletion is
  likewise idempotent.
