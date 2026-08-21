#!/usr/bin/env bash
# End-to-end check against a running instance.
#
#   ./scripts/smoke-test.sh [base-url]
#
# Exercises every documented endpoint and asserts the shape of what comes back.
# Intended for use after a deploy, and as the thing to run first when someone
# reports that the component is misbehaving.
set -uo pipefail

BASE="${1:-http://localhost:8080}"
PASS=0
FAIL=0

check() {
  local label="$1" url="$2" expr="$3"
  local body status
  body=$(curl -sS -m 30 -w $'\n%{http_code}' "$url" 2>/dev/null)
  status=$(printf '%s' "$body" | tail -1)
  body=$(printf '%s' "$body" | sed '$d')

  if [ "$status" != "200" ]; then
    printf '  FAIL  %-44s HTTP %s\n' "$label" "$status"
    FAIL=$((FAIL + 1))
    return
  fi
  if printf '%s' "$body" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception as e: sys.exit('bad json: %s' % e)
sys.exit(0 if ($expr) else 'assertion failed')
" 2>/dev/null; then
    printf '  ok    %-44s\n' "$label"
    PASS=$((PASS + 1))
  else
    printf '  FAIL  %-44s assertion: %s\n' "$label" "$expr"
    FAIL=$((FAIL + 1))
  fi
}

printf '\nSmoke test against %s\n\n' "$BASE"

check "health is ok"                "$BASE/health"                          "d['status']=='ok'"
check "ready reports the database"  "$BASE/ready"                           "d['status']=='ready'"
check "status has company counts"   "$BASE/v1/status"                       "d['counts']['companies']>0"
check "status lists providers"      "$BASE/v1/status"                       "len(d['providers'])>0"
check "companies are paginated"     "$BASE/v1/companies?limit=5"            "len(d['data'])<=5 and d['pagination']['total']>0"
check "companies filter by exchange" "$BASE/v1/companies?exchange=LN&limit=3" "all(any(l['exchange']=='LN' for l in c['listings']) for c in d['data'])"
check "search by name works"        "$BASE/v1/companies?q=apple&limit=3"    "len(d['data'])>0"
check "a company has listings"      "$BASE/v1/companies/AAPL"               "d['data']['ticker'].upper()=='AAPL' and len(d['data']['listings'])>0"
check "listing mapping exports"     "$BASE/v1/listings?limit=5"             "len(d['data'])<=5"
check "company news feed"           "$BASE/v1/companies/AAPL/news?limit=5"  "'data' in d and 'pagination' in d"
check "news rows carry provenance"  "$BASE/v1/news?limit=5"                 "all('provider' in a and 'source_tier' in a and 'companies' in a for a in d['data'])"
check "feed is one row per article" "$BASE/v1/news?limit=25"                "len({a['id'] for a in d['data']}) == len(d['data'])"
check "round-ups can be excluded"   "$BASE/v1/news?limit=10&max_companies=3" "all(a['company_count'] <= 3 for a in d['data'])"
check "market news feed"            "$BASE/v1/market-news?limit=5"          "'data' in d and all(a.get('source') is not None for a in d['data'])"
check "primary-wire filter works"   "$BASE/v1/market-news?limit=5&max_source_tier=1" "all(a['source_tier'] == 1 for a in d['data'])"
check "news filters by date"        "$BASE/v1/news?from=2000-01-01&limit=3" "'data' in d"
check "runs are listed"             "$BASE/v1/runs?limit=3"                 "isinstance(d['data'],list)"

# 404 handling is a contract too.
code=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$BASE/v1/companies/__nope__" 2>/dev/null)
if [ "$code" = "404" ]; then
  printf '  ok    %-44s\n' "unknown ticker returns 404"; PASS=$((PASS + 1))
else
  printf '  FAIL  %-44s got HTTP %s\n' "unknown ticker returns 404" "$code"; FAIL=$((FAIL + 1))
fi

# A targeted synchronous fetch must be safe to repeat.
code=$(curl -sS -m 120 -o /tmp/smoke-fetch.json -w '%{http_code}' \
  -X POST "$BASE/v1/fetch" -H 'content-type: application/json' \
  -d '{"tickers":["AAPL"],"wait":true}' 2>/dev/null)
if [ "$code" = "200" ] || [ "$code" = "409" ]; then
  printf '  ok    %-44s HTTP %s\n' "on-demand fetch accepted" "$code"; PASS=$((PASS + 1))
else
  printf '  FAIL  %-44s HTTP %s\n' "on-demand fetch accepted" "$code"; FAIL=$((FAIL + 1))
fi

printf '\n  %d passed, %d failed\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
