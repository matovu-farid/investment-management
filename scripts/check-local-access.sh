#!/usr/bin/env bash
# Disposable synthetic access checks. Never point these tests at live data.
set -euo pipefail
cd "$(dirname "$0")/.."
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  printf 'Port 3000 is in use; stop that server before running this isolated check.\n' >&2
  exit 1
fi
audit_dir=$(mktemp -d "${TMPDIR:-/tmp}/rnig-access-audit.XXXXXX")
audit_pid=''
cleanup() {
  if [[ -n "$audit_pid" ]]; then kill "$audit_pid" 2>/dev/null || true; wait "$audit_pid" 2>/dev/null || true; fi
  rm -rf -- "$audit_dir"
}
trap cleanup EXIT INT TERM
export RNIG_LOCAL_STATE="$audit_dir/state"
export PROVISION_PASSWORD='Local-Test-Password-456'
export RNIG_AUTH_TEST_PASSWORD="$PROVISION_PASSWORD" RNIG_MEMBER_TEST_PASSWORD="$PROVISION_PASSWORD"
export RNIG_AUTH_TEST_EMAIL='role-admin@example.test' RNIG_MEMBER_TEST_EMAIL='role-member@example.test' RNIG_OTHER_MEMBER_TEST_EMAIL='role-other@example.test'
export RNIG_AUTH_TEST_ORIGIN='http://localhost:3000'
./node_modules/.bin/wrangler d1 migrations apply rnig-investments --local --persist-to "$RNIG_LOCAL_STATE" >"$audit_dir/migrations.log" 2>&1 || { tail -25 "$audit_dir/migrations.log" >&2; exit 1; }
PROVISION_EMAIL="$RNIG_AUTH_TEST_EMAIL" PROVISION_NAME='Audit Administrator' node scripts/provision-user.mjs --local --admin >"$audit_dir/provision.log" 2>&1 || { tail -20 "$audit_dir/provision.log" >&2; exit 1; }
PROVISION_EMAIL="$RNIG_MEMBER_TEST_EMAIL" PROVISION_NAME='Audit Member' node scripts/provision-user.mjs --local >"$audit_dir/provision.log" 2>&1 || { tail -20 "$audit_dir/provision.log" >&2; exit 1; }
PROVISION_EMAIL="$RNIG_OTHER_MEMBER_TEST_EMAIL" PROVISION_NAME='Other Member' node scripts/provision-user.mjs --local >"$audit_dir/provision.log" 2>&1 || { tail -20 "$audit_dir/provision.log" >&2; exit 1; }
./node_modules/.bin/wrangler d1 execute rnig-investments --local --persist-to "$RNIG_LOCAL_STATE" --file tests/security/fixtures/access-audit.sql >"$audit_dir/fixture.log" 2>&1 || { tail -25 "$audit_dir/fixture.log" >&2; exit 1; }
./node_modules/.bin/vite dev --port 3000 >"$audit_dir/server.log" 2>&1 &
audit_pid=$!
ready=false
for ((attempt=0;attempt<60;attempt++)); do
  if curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null; then ready=true; break; fi
  if ! kill -0 "$audit_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then tail -30 "$audit_dir/server.log" >&2; exit 1; fi
# Authentication rate limits are per IP. Reset only this disposable database
# between independent scenarios, rather than altering the application's limits.
reset_test_rate_limit() {
  ./node_modules/.bin/wrangler d1 execute rnig-investments --local --persist-to "$RNIG_LOCAL_STATE" --command 'DELETE FROM "rateLimit"' >"$audit_dir/rate-limit.log" 2>&1 || { tail -20 "$audit_dir/rate-limit.log" >&2; exit 1; }
}
node --experimental-strip-types --test tests/security/protected-routes.integration.test.ts
reset_test_rate_limit
node --experimental-strip-types --test tests/security/admin-pages.integration.test.ts
reset_test_rate_limit
node --experimental-strip-types --test tests/security/role-boundaries.integration.test.ts
reset_test_rate_limit
node --experimental-strip-types --test tests/security/member-privacy.integration.test.ts
reset_test_rate_limit
node --experimental-strip-types --test tests/security/role-writes.integration.test.ts
if [[ -n "${RNIG_BROWSER_TEST_PLAYWRIGHT:-}" && -n "${RNIG_BROWSER_TEST_CHROME:-}" ]]; then
  reset_test_rate_limit
  ./node_modules/.bin/wrangler d1 execute rnig-investments --local --persist-to "$RNIG_LOCAL_STATE" --command "INSERT INTO ledger_accounts(id,code,name,currency) VALUES('browser-export-account','browser-export',char(127)||'=1+1','UGX'),('browser-receivable','browser-recv','Fictional receivable','UGX')" >"$audit_dir/browser-account.log" 2>&1 || { tail -20 "$audit_dir/browser-account.log" >&2; exit 1; }
  ./node_modules/.bin/wrangler d1 execute rnig-investments --local --persist-to "$RNIG_LOCAL_STATE" --command "INSERT INTO share_sale_requests(id,member_id,shares,asking_price_minor,currency,request_date,created_by,request_key) VALUES('browser-sale-one','audit-member',5,100,'UGX','2026-01-01','fixture','browser-sale-key-one'),('browser-sale-two','member-two',6,200,'UGX','2026-01-01','fixture','browser-sale-key-two')" >"$audit_dir/browser-fixture.log" 2>&1 || { tail -20 "$audit_dir/browser-fixture.log" >&2; exit 1; }
  node --test tests/security/recovery-navigation.browser.test.mjs
fi
