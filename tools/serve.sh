#!/bin/sh
# Lokale test: bouwt en serveert dist onder /visvangst/ op poort 8795 (stopt een eerdere versie op die poort)
cd "$(dirname "$0")/.." && npx vite build >/dev/null || exit 1
old=$(ss -ltnp 2>/dev/null | grep ':8795 ' | sed -E 's/.*pid=([0-9]+).*/\1/')
[ -n "$old" ] && kill "$old" && sleep 0.5
rm -rf /tmp/vvserve && mkdir -p /tmp/vvserve && cp -r dist /tmp/vvserve/visvangst
cd /tmp/vvserve && nohup python3 -m http.server 8795 >/tmp/vvserve.log 2>&1 &
sleep 1
