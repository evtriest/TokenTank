# What's left in the bank

A local-first panel for free model providers: what is in rotation, what a
provider's quota is, how much is left, when it refills, and which models a local
machine actually serves. No account, no backend database, nothing polled in the
background.

The panel ships in **two independent versions** built from this one repository.
They do not talk to each other and each keeps its own state in the browser it
runs in.

| | Local network version | Cloud version |
| --- | --- | --- |
| Build | `npm run build` | `npm run build:cloud` |
| Output | `dist/` | `dist-cloud/` (base `/usage/`) |
| Reads | every device on the LAN it scans | only the server it runs on, over `127.0.0.1` |
| Machines | discovered by the scan | one server entry plus machines you add by hand over SSH |
| Servers | `python3 server.py --port 8094` on the Pi | `python3 server.py --cloud --port 8094 --bind 127.0.0.1` behind nginx |
| State | `localStorage` key `freetokens.panel.v1` | `localStorage` key `freetokens.panel.cloud.v1` |

The cloud panel starts with an empty rotation and an empty try list: it only
shows what is live on that server, and it reads the server once when it opens.
The local panel keeps the full provider inventory.

## Run it

```sh
npm install
npm run dev            # development on http://localhost:5173
npm run build           # local network version -> dist/
npm run build:cloud     # cloud version -> dist-cloud/ (served under /usage/)
```

Both builds typecheck with `tsc --noEmit`; there is no test suite.

## The two halves

`server.py` is the small scanner behind the panel. It answers three routes:

- `GET /api/scan` — the inventory. Without `--cloud` it probes the local
  `/24` subnet (ARP table, then the known model ports); with `--cloud` it probes
  `127.0.0.1` only and reports this server.
- `POST /api/ssh/check` — a non-interactive `ssh … true` so the cloud panel can
  prove a machine is reachable before it is added. The pasted command must start
  with `ssh`; shell metacharacters and `ProxyCommand` are refused.
- `GET /api/ssh/identity` — the server's public key, so it can be authorised on
  the machine you add.

The scanner reads Ollama (`/api/tags`) and OpenAI-compatible servers
(`/v1/models`) on 11434, 8080, 8000, 1234, 5001 and 8081, and reports the agent
version next to the models.

## Cloud deployment sketch

```sh
npm run build:cloud
rsync -a --delete dist-cloud/ host:~/freetokens/dist/
scp server.py host:~/freetokens/
ssh host 'cd ~/freetokens && python3 server.py --cloud --port 8094 --bind 127.0.0.1 --directory dist'
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
  data/local.ts          local provider, and the cloud panel's server provider
  lib/quota.ts           windows, resets, percentages
  lib/hosts.ts           machine defaults and model split helpers
  components/            cards, scan bar, add-provider and add-machine modals
  pages/                 overview and provider detail
server.py                scan + ssh check + static files
```

## License

No license file yet; ask before redistributing.
