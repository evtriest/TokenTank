#!/usr/bin/env bash
# run30.sh — zet /usage/ (Freetokens-paneel) in het 443-blok van beide vhosts.
#
# run29 zette het blok in het poort-80-blok, waar het nooit geserveerd wordt:
# https://<ip>/ en https://<host>/ gaven 404. run30 haalt het blok uit poort 80
# (daar doet `location /` weer de 301 naar https) en zet het vóór de laatste
# `location /` van het 443-blok, net als run12 voor /blocked deed.
#
# Idempotent: een tweede run laat alles staan wat al goed is.
# Draaien als root:  sudo bash ~/run30/run30.sh

set -uo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="/root/ovh-backup/run30-$STAMP"
FILES=(/etc/nginx/sites-available/vps /etc/nginx/sites-available/n8n-https)
WEBROOT=/var/www/vps/public

die() { echo "FOUT: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "dit script vraagt root: sudo bash $0"
command -v nginx >/dev/null || die "nginx niet gevonden"
for f in "${FILES[@]}"; do [ -f "$f" ] || die "mist $f"; done

mkdir -p "$BACKUP" || die "kan $BACKUP niet maken"
for f in "${FILES[@]}"; do cp -a "$f" "$BACKUP/$(basename "$f")"; done
echo "back-up: $BACKUP"

python3 - "${FILES[@]}" <<'PY' || exit 1
import re
import sys

COMMENT = "    # run29: Freetokens-paneel (127.0.0.1:8094) achter de beheerlogin\n"
REDIRECT = "    location = /usage { return 301 /usage/; }\n"
PROXY = """    location ^~ /usage/ {
        auth_basic "beheer";
        auth_basic_user_file /etc/nginx/.htpasswd-admin;
        proxy_pass http://127.0.0.1:8094/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
"""
BLOCK = COMMENT + REDIRECT + PROXY


def server_blocks(text):
    """Top-level `server { ... }` spans, as (start, end) offsets."""
    spans = []
    for match in re.finditer(r"(?m)^server \{", text):
        index = match.end() - 1
        depth = 0
        while index < len(text):
            char = text[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    break
            index += 1
        spans.append((match.start(), index + 1))
    return spans


def usage_block_span(block):
    """Offsets of the run29 /usage/ block inside a server block, or None."""
    start = block.find("location = /usage")
    if start < 0:
        start = block.find("location ^~ /usage/")
    if start < 0:
        return None
    line_start = block.rfind("\n", 0, start) + 1
    proxy = block.find("location ^~ /usage/", start)
    if proxy < 0:
        return None
    end = block.find("\n    }", proxy)
    if end < 0:
        return None
    return line_start, end + len("\n    }\n")


def is_https(block):
    return re.search(r"(?m)^\s*listen\s+[^;]*443[^;]*;", block) is not None


def is_http_only(block):
    listens = re.findall(r"(?m)^\s*listen\s+([^;]+);", block)
    return bool(listens) and all("443" not in listen for listen in listens)


changed = 0
for path in sys.argv[1:]:
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    spans = server_blocks(text)
    if len(spans) < 2:
        sys.exit(f"{path}: verwacht minstens twee server-blokken, gevonden {len(spans)}")

    tls = [span for span in spans if is_https(text[span[0]:span[1]])]
    if len(tls) != 1:
        sys.exit(f"{path}: verwacht precies één 443-blok, gevonden {len(tls)}")
    tls_start, tls_end = tls[0]
    tls_block = text[tls_start:tls_end]

    if tls_block.count("location ^~ /usage/") == 1:
        print(f"{path}: /usage/ staat al in het 443-blok — niets te doen")
        if BLOCK not in tls_block:
            tls_block = tls_block.replace(
                PROXY, PROXY.replace('auth_basic "beheer";', 'auth_basic "beheer";'), 1
            )
        # ruim een eventuele kopie in het poort-80-blok op
        plain = [
            span
            for span in spans
            if span != (tls_start, tls_end)
            and is_http_only(text[span[0]:span[1]])
            and usage_block_span(text[span[0]:span[1]])
        ]
        if not plain:
            continue
        low_start, low_end = plain[0]
        low = text[low_start:low_end]
        cut = usage_block_span(low)
        new_low = low[:cut[0]] + low[cut[1]:]
        new_low = re.sub(r"\n{3,}", "\n\n", new_low)
        text = text[:low_start] + new_low + text[low_end:tls_start] + tls_block + text[tls_end:]
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        changed += 1
        print(f"{path}: kopie uit poort 80 gehaald")
        continue

    if "/usage/" in tls_block:
        sys.exit(f"{path}: onverwachte /usage/-regel in het 443-blok; niets gewijzigd")

    # blok uit poort 80 halen
    sources = [
        span
        for span in spans
        if span != (tls_start, tls_end)
        and is_http_only(text[span[0]:span[1]])
        and usage_block_span(text[span[0]:span[1]])
    ]
    if not sources:
        sys.exit(f"{path}: geen /usage/-blok gevonden om te verplaatsen")
    low_start, low_end = sources[0]
    low = text[low_start:low_end]
    cut = usage_block_span(low)
    new_low = low[:cut[0]] + low[cut[1]:]
    new_low = re.sub(r"\n{3,}", "\n\n", new_low)

    # invoegen vóór de laatste `location /` van het 443-blok
    anchor = tls_block.rfind("\n    location / {")
    if anchor < 0:
        sys.exit(f"{path}: geen `location /` in het 443-blok")
    new_tls = tls_block[:anchor + 1] + BLOCK + tls_block[anchor + 1:]

    if new_tls.count("location ^~ /usage/") != 1:
        sys.exit(f"{path}: invoegen leverde {new_tls.count('location ^~ /usage/')} blokken op")

    text = text[:low_start] + new_low + text[low_end:tls_start] + new_tls + text[tls_end:]
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    changed += 1
    print(f"{path}: /usage/ verplaatst naar het 443-blok")

print(f"gewijzigd: {changed}")
PY

echo
echo "--- nginx -t ---"
nginx -t || die "nginx -t faalt; back-up staat in $BACKUP"
systemctl reload nginx || die "reload faalde"
sleep 1

echo
echo "--- controle ---"
check() {
  local url=$1 code
  code=$(curl -sk -o /dev/null -m 10 -w "%{http_code}" "$url")
  printf "%-52s %s\n" "$url" "$code"
}
for host in https://15.235.249.177 https://vps-c73922e3.vps.ovh.ca; do
  check "$host/usage/"
  check "$host/usage/api/scan"
  check "$host/"
done
echo
echo -n "menu-item op de homepage: "
curl -s -m 10 "$WEBROOT/index.html" >/dev/null 2>&1
grep -c "Provider/model Usage" "$WEBROOT/index.html" || true
echo -n "/usage/ in de geladen config: "
nginx -T 2>/dev/null | grep -c "location ^~ /usage/" || true
echo
echo "Klaar. Verwachting: /usage/ geeft 401 (login 'beheer'), / geeft 200."
