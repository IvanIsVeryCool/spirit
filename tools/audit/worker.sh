#!/usr/bin/env bash
# The photo Worker for real, with local KV (in .wrangler/, git-ignored): submit, the review list, approve, the public list,
# the image, remove, a wrong password, a too-big upload, and the caching headers from _headers. Run from the repo root:
# `bash tools/audit/worker.sh` (Wrangler downloads on first use; about 2 minutes). Every line should say ok.
set -u
cd "$(git rev-parse --show-toplevel)"
B=http://localhost:8787; T=$(mktemp -d); C="curl -s -m 20"
(timeout 600 npx -y wrangler@4 dev --port 8787 --var REVIEW_PASSWORD:test > "$T/wrangler.log" 2>&1 &)
for i in $(seq 60); do $C -o /dev/null "$B/api/photos" && break; sleep 3; done
check() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: got [$2], expected [$3]"; fi; }
python3 - "$T" <<'PY'
import struct, zlib, sys
def png(w, h):
    raw = b''.join(b'\x00' + b'\xc9\x27\x2c' * w for _ in range(h))
    c = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + c(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + c(b'IDAT', zlib.compress(raw)) + c(b'IEND', b'')
open(sys.argv[1] + '/t.png', 'wb').write(png(4, 4))
PY
head -c 5000000 /dev/urandom > "$T/big.bin"
check "submit"            "$($C -F photo=@$T/t.png -F caption='Audit test' -F consent=yes -F album=Audit $B/api/photos)" '{"ok":true}'
check "no consent"        "$($C -o /dev/null -w '%{http_code}' -F photo=@$T/t.png $B/api/photos)" 400
check "not a photo"       "$(echo hello > $T/x.txt; $C -o /dev/null -w '%{http_code}' -F photo=@$T/x.txt -F consent=yes $B/api/photos)" 415
check "too big"           "$($C -o /dev/null -w '%{http_code}' -F photo=@$T/big.bin -F consent=yes $B/api/photos)" 413
check "wrong password"    "$($C -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer nope' $B/api/review)" 401
ID=$($C -H 'Authorization: Bearer test' $B/api/review | python3 -c "import json,sys;w=[p for p in json.load(sys.stdin)['waiting'] if p['caption']=='Audit test'];print(w[0]['id'] if w else '')")
check "waiting for review" "$([ -n "$ID" ] && echo yes)" yes
check "hidden before approval" "$($C $B/api/photos | grep -c "$ID")" 0
check "approve"           "$($C -H 'Authorization: Bearer test' -H 'content-type: application/json' -d '{"action":"approve"}' $B/api/review/$ID)" '{"ok":true}'
check "listed after approval" "$($C $B/api/photos | grep -c "$ID")" 1
check "image served"      "$($C -o /dev/null -w '%{http_code} %{content_type}' $B/api/photos/$ID)" "200 image/png"
check "remove"            "$($C -H 'Authorization: Bearer test' -H 'content-type: application/json' -d '{"action":"remove"}' $B/api/review/$ID)" '{"ok":true}'
check "gone after removal" "$($C $B/api/photos | grep -c "$ID")" 0
check "site still served" "$($C -o /dev/null -w '%{http_code}' $B/)" 200
check "vendor cached a month" "$($C -I $B/vendor/three.module.min.js | grep -i '^cache-control' | tr -d '\r' | cut -d' ' -f2-)" "public, max-age=2592000"
check "scripts revalidated" "$($C -I $B/hub/hub.js | grep -i '^cache-control' | tr -d '\r' | cut -d' ' -f2-)" "public, max-age=0, must-revalidate"
check "repo files hidden" "$($C -o /dev/null -w '%{http_code}' $B/CLAUDE.md)" 301
pkill -f "wrangler@4 dev --port 8787" >/dev/null 2>&1; pkill -f "workerd" >/dev/null 2>&1
rm -rf "$T"
