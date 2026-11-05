# TokenTank

*What's left in the tank.* A local-first panel for free model providers: what is in rotation, what a
provider's quota is, how much is left, when it refills, and which models a local
machine actually serves. No account, no backend database, nothing polled in the
background.

It is **one panel that runs anywhere**. What it can read is decided at runtime,
not by a build flag: press Scan and it asks what to read — the local network
when this machine has one, this server, or an address, range or subnet you name.
A target outside the private ranges is shown in red and needs a second click
before anything leaves the server.

| | Private network (the Pi) | Public server (the VPS) |
| --- | --- | --- |
| Build | `npm run build` → `dist/`, base `/` | `npm run build:cloud` → `dist-cloud/`, base `/usage/` |
| Server | `python3 server.py --port 8094` | `python3 server.py --bind 127.0.0.1 --port 8094` behind nginx |
| Scan offers | local network · this server · an address or range | this server · an address or range |
| State | `localStorage` key `freetokens.panel.v1` | the same key, in a different origin |

The two builds differ only in the path the app is served from; the behaviour is
the same code. The storage key kept its old `freetokens.` prefix on purpose: a
panel that was already in use keeps its saved state through the rename. It is
per origin, so the Pi's panel and the VPS's panel never overwrite each other.

A panel with nothing saved adopts the machine it runs on: the provider board
where there is a private network, only that server's own inventory elsewhere.
It reads once when it opens; the Scan button is the only other thing that
touches the network.

## Run it

```sh
npm install
npm run dev            # development on http://localhost:5173
npm run build           # dist/, served from the root
npm run build:cloud     # dist-cloud/, served under /usage/
```

Both builds typecheck with `tsc --noEmit`; there is no test suite.

## The two halves

`server.py` is the small scanner behind the panel. It answers four routes:

- `GET /api/context` — where this server lives: its address, the private subnet
  when it has one, and the address limit for scans. One status read, no probes.
- `GET /api/scan` — the inventory. Without `?target=` it sweeps the private
  network when the server sits on one (ARP table, then the known model ports)
  and reports only this server otherwise. `?target=` takes one address,
  `192.168.1.10-50` or `192.168.1.0/24`; targets outside the private ranges need
  `&confirm=public` and are refused above 512 addresses. `--cloud` keeps a
  target-less scan on this server.
- `POST /api/ssh/check` — a non-interactive `ssh … true` so the panel can prove
  a machine is reachable before it is added. The pasted command must start with
  `ssh`; shell metacharacters and `ProxyCommand` are refused.
- `GET /api/ssh/identity` — the server's public key, so it can be authorised on
  the machine you add.

The scanner reads Ollama (`/api/tags`) and OpenAI-compatible servers
(`/v1/models`) on 11434, 8080, 8000, 1234, 5001 and 8081, and reports the agent
version next to the models.

## Cloud deployment sketch

```sh
npm run build:cloud
rsync -a --delete dist-cloud/ host:~/tokentank/dist/
scp server.py host:~/tokentank/
ssh host 'cd ~/tokentank && python3 server.py --cloud --port 8094 --bind 127.0.0.1 --directory dist'
```

nginx puts the panel on a path behind basic auth:

```nginx
location = /usage { return 301 /usage/; }
location ^~ /usage/ {
    auth_basic "beheer";
    auth_basic_user_file /etc/nginx/.htpasswd-admin;
    proxy_pass http://127.0.0.1:8094/;
}
```

Do not put that block in the port-80 server: it will never be reached and the
panel 404s over https. A cron watchdog (`pgrep` on the exact command line,
anchored) restarts the process if it disappears.

With models served by a rootless Ollama:

```sh
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MODELS=$HOME/ollama/models \
  nohup $HOME/ollama/bin/ollama serve >> $HOME/ollama/serve.log 2>&1 &
$HOME/ollama/bin/ollama pull qwen2.5:0.5b
```

## Layout

```
src/
  store.tsx              panel state, scan merging, persistence
  data/seed.ts           provider starting data for the local panel
  data/local.ts          local provider, and the bare server start
  lib/target.ts          address, range and subnet checks for the scan dialog
  lib/quota.ts           windows, resets, percentages
  lib/hosts.ts           machine defaults and model split helpers
  components/            cards, scan bar + target dialog, add-provider/-machine
  pages/                 overview and provider detail
server.py                scan + ssh check + static files
```

## License

No license file yet; ask before redistributing.
