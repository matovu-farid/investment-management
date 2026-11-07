# Backup and recovery

This is an operator runbook, not evidence that scheduled backups exist. The app uses D1 `rnig-investments` for accounts and records and the private R2 bucket `rnig-investments-documents` for supporting files and their metadata. Code, D1, R2 and Worker secrets require separate protection; recovering one does not recover the others. Data may include member information and password hashes. Keep backups encrypted, access-controlled, outside this checkout and the public GitHub repository. Do not put exports, access keys, document contents or reset links in logs or tickets.

## What has been checked

On 7 November 2026, the local source archive `/Users/faridmatovu/Documents/RNIG-source-backup-2026-11-07-integrated.tar.gz` was unpacked into a disposable directory; all 499 archive entries and representative source/configuration files were present. The local Git bundle `/Users/faridmatovu/Documents/RNIG-history-2026-11-07.bundle` was imported into a separate bare repository, passed `git fsck --full`, and contained commit `f776edc`. The bundle predates the Resend commit `04539a0` and subsequent work: make a fresh copy after changes are finished. These are local copies, not off-device backups. Ignored files, local databases and secrets were excluded from the source archive.

A separate synthetic local D1 drill exported a single table to SQL, imported it into a different disposable local D1 store, and confirmed the text value `9007199254740993` survived unchanged. This is not a restore of the live schema, data, authentication or every numeric type. No production D1 or R2 data was exported or restored in the drill.

On 7 November 2026, a synthetic 45-byte PDF was copied through three separate local Miniflare R2 buckets representing source, backup and restore. The restored bytes matched the original SHA-256, and list and get operations returned the same custom metadata (including document title, source, date, uploader, hash and replacement fields) and PDF content type. The restored object and representative metadata were still present after restarting the local runtime with the same temporary storage. This exercised a Workers R2 API copy in local simulation; it did not test the S3 command below, a bulk copy, remote Cloudflare R2 or an independent backup destination.

## Before any backup or restore

1. Identify the Cloudflare account, the exact database and bucket, and who can access the backup. Stop application writes or arrange a maintenance window: D1 and R2 do not provide a shared snapshot transaction. Record each capture time in UTC and keep the app version and migrations alongside the data.
2. Record inventory, row counts and approved reconciliation checks without publishing private records. Securely preserve the Worker secret values separately; a SQL export and source bundle do not restore `BETTER_AUTH_SECRET` or `RESEND_API_KEY`. Preserve the original Better Auth secret when restoring the existing deployment; an unintended change can invalidate sessions and other auth state.
3. Use a new, separate recovery target for drills. Never import or copy over the live database or bucket to see whether a backup works. An in-place D1 Time Travel restore is destructive; decide who may authorize it and arrange a maintenance window before proceeding.

## D1: export and restore drill

Cloudflare's [D1 import/export guide](https://developers.cloudflare.com/d1/best-practices/import-export-data/) documents SQL exports and imports. For an approved backup, use the project-local Wrangler from the project directory and an access-controlled backup directory outside the checkout:

```sh
npx wrangler d1 export rnig-investments --remote --output /secure/location/rnig-d1.sql
```

The export can block database requests while running. Treat the resulting SQL as sensitive, encrypt it using the organization's approved method, restrict access, and store a verified copy away from the original account. Record its integrity checksum and the app version and capture time separately. The exact retention schedule and protected backup destination still need to be established; no remote export was taken as part of this work.

To test, create a *separate empty* local or recovery D1 database with its own configuration and apply the SQL file using `wrangler d1 execute <recovery-database> --file <export.sql>` with the explicit `--local` or `--remote` flag for that target. Verify the target and account before every command. Compare schema, migration state, key row counts, relationships and exact monetary values with the captured checks, and exercise sign-in and representative reports in an isolated environment. Do not use real member data in a publicly reachable test app.

Cloudflare notes that SQL export is unsupported for databases containing virtual tables and that numeric values can be affected by JavaScript number precision. The synthetic drill above proves only a TEXT value; it does not prove exact export of all 64-bit integer amounts. Check exact values against the source and use a validated alternative if precision or schema coverage is insufficient. Never treat an unverified import as a reconciled set of books.

### Time Travel

[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) is a separate in-place recovery option for eligible D1 databases. Confirm the database uses the production storage backend and check the account's current retention and plan; Cloudflare documents up to seven days on Workers Free and 30 days on Workers Paid. Retrieve a bookmark without restoring:

```sh
npx wrangler d1 info rnig-investments
npx wrangler d1 time-travel info rnig-investments
```

Restoring a bookmark overwrites the database and cancels in-flight work. It does not roll back R2 or Worker code. Preserve the current bookmark, understand the impact of lost writes, and obtain the appropriate operational authorization before using Cloudflare's documented restore command. Keep the previous bookmark returned by the restore. Time Travel is not a substitute for an independently protected longer-term backup.

## R2: preserve files *and* metadata

The document register stores its display fields and integrity information as R2 custom metadata on each object. Copying only PDF bytes to disk and re-uploading them with `wrangler r2 object put` is **not** a complete restore: the register can lose title, source, date, uploader and hash. Back up all application object keys, including any future correction records, preserving both custom and HTTP metadata, content and exact key names. Keep bucket configuration and access policies documented separately. R2 and D1 are independent; match their capture times and reconcile after recovery.

For a planned backup, first provision an access-controlled, non-public backup destination and appropriate least-privilege S3-compatible R2 credentials through Cloudflare's [R2 S3 guide](https://developers.cloudflare.com/r2/get-started/s3/). Use distinct credentials and a separate account or protected storage for stronger isolation. Cloudflare supports S3 `CopyObject` and its metadata directive; see [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/) and [AWS CLI copy options](https://docs.aws.amazon.com/cli/latest/reference/s3/cp.html). The following **illustrates** a server-side copy of one synthetic object between separate buckets on the same R2 endpoint; replace every placeholder only in a controlled drill and use an appropriately scoped profile:

```sh
aws --profile rnig-r2-drill --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com \
  s3api copy-object --copy-source SOURCE_BUCKET/supporting-documents/OBJECT_ID \
  --bucket RECOVERY_BUCKET --key supporting-documents/OBJECT_ID --metadata-directive COPY
```

List *all* pages of source objects and repeat for each key, preserving every prefix. Do not use a mirror operation that deletes destination objects. A single R2-to-R2 copy in the same account is not independent protection against account compromise or accidental deletion. Record the key, size, custom and HTTP metadata, original R2 upload timestamp, and a content hash for each object in a protected manifest; verify them against the copied objects, including the exact metadata keys and values the application expects. Copying to a new object may give it a new R2 upload timestamp, so retain the original separately rather than treating the restored timestamp as the original creation date. Use a fresh isolated bucket and synthetic PDFs to verify upload, list, download, metadata and byte-for-byte integrity before trusting the procedure. No bulk R2 backup or remote R2 restore drill has been performed yet.

Before restoring real objects, determine whether the destination already contains newer data. Prefer an empty recovery bucket, validate the restored object bytes and metadata, and test through an isolated Worker with separately configured D1 and R2 bindings. Never point a test Worker at live data by accident. Only after validation and operational authorization should the production binding or data be changed.
