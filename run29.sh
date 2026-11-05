#!/usr/bin/env bash
# run29.sh — het Freetokens-paneel onder /usage/ op de OVH-VPS (EepsHub).
#
# Het paneel zelf draait al als ai-agents op 127.0.0.1:8094 (crontab @reboot +
# watchdog). Dit script doet alleen wat root nodig heeft: de nginx-locatie op
# beide vhosts en het menu-item "Provider/model Usage" op de homepage.
#
# Draaien:  ssh -t ovh 'sudo bash ~/run29/run29.sh'
# Idempotent: een tweede run laat staan wat al goed is en maakt eerst een back-up.

set -euo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="/root/ovh-backup/run29-$STAMP"
WEBROOT=/var/www/vps/public
PORT=8094
AUTH_FILE=/etc/nginx/.htpasswd-admin

if [ ! -f "$AUTH_FILE" ]; then
  echo "FOUT: $AUTH_FILE ontbreekt; /usage/ wordt dan niet toegevoegd." >&2
  exit 1
fi

mkdir -p "$BACKUP"
for f in /etc/nginx/sites-available/vps /etc/nginx/sites-available/n8n-https "$WEBROOT/index.html"; do
  cp -a "$f" "$BACKUP/$(basename "$f")"
done
echo "back-up: $BACKUP"

# 1. Menu-item op de homepage, direct na "Blocked".
if grep -q 'href="/usage/"' "$WEBROOT/index.html"; then
  echo "menu-item staat er al"
else
  python3 - "$WEBROOT/index.html" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
html = path.read_text(encoding="utf-8")
needle = '      <a href="/blocked">Blocked</a>\n'
if needle not in html:
    raise SystemExit("ankering voor het menu-item niet gevonden")
html = html.replace(
    needle, needle + '      <a href="/usage/">Provider/model Usage</a>\n', 1
)
path.write_text(html, encoding="utf-8")
print("menu-item toegevoegd")
PY
fi

# 2. De /usage/-locatie in beide vhosts die de homepage serveren.
add_location() {
  file=$1
  if grep -q 'location \^~ /usage/' "$file"; then
    echo "$file had de locatie al"
    return
  fi
  python3 - "$file" "$PORT" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
port = sys.argv[2]
text = path.read_text(encoding="utf-8")
block = f"""
    # run29: Freetokens-paneel (127.0.0.1:{port}) achter de beheerlogin
    location = /usage {{ return 301 /usage/; }}
    location ^~ /usage/ {{
        auth_basic "beheer";
        auth_basic_user_file /etc/nginx/.htpasswd-admin;
        proxy_pass http://127.0.0.1:{port}/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }}
"""
anchor = "    location / {"
if anchor not in text:
    raise SystemExit(f"geen location / in {path}")
text = text.replace(anchor, block + "\n" + anchor, 1)
path.write_text(text, encoding="utf-8")
print(f"locatie toegevoegd aan {path.name}")
PY
}

add_location /etc/nginx/sites-available/vps
add_location /etc/nginx/sites-available/n8n-https

nginx -t
systemctl reload nginx
echo "nginx herladen"

# 3. Meten: zonder login hoort /usage/ 401 te geven.
for url in https://vps-c73922e3.vps.ovh.ca/usage/ https://15.235.249.177/usage/; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' "$url" || echo "000")
  echo "$url -> $code"
done
echo "menu-item: $(grep -c 'Provider/model Usage' "$WEBROOT/index.html")x op de homepage"
