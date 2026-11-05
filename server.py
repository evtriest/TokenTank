#!/usr/bin/env python3
"""TokenTank panel server: static build plus a local-network model scanner.

Serves the built panel and answers GET /api/scan with every device it can see
on the local subnet, and the model list of any host running Ollama or an
OpenAI-compatible server. Scans are cached briefly so a page reload is cheap;
`?refresh=1` (the Scan network button) always does a fresh sweep.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import functools
import ipaddress
import json
import os
import re
import shlex
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

OLLAMA_PORT = 11434
API_PORTS = (11434, 8080, 8000, 1234, 5001, 8081)
PORT_TIMEOUT = 0.4
HTTP_TIMEOUT = 2.0
CACHE_SECONDS = 20
MAX_HOSTS = 512
SSH_TIMEOUT = 15
SSH_FORBIDDEN = set(";|&`$<>\n\r\t")
SSH_BANNED_OPTIONS = ("proxycommand", "localcommand", "permitlocalcommand")

_cache_lock = threading.Lock()
_scan_lock = threading.Lock()
_cache: dict[str, object] = {"payload": None, "at": 0.0}


def local_ip_and_prefix() -> tuple[str, int]:
    """The address and prefix of the interface that reaches the LAN."""
    try:
        output = subprocess.run(
            ["ip", "-4", "-o", "addr", "show", "scope", "global"],
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        output = ""

    for line in output.splitlines():
        match = re.search(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", line)
        if match:
            return match.group(1), int(match.group(2))

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("1.1.1.1", 80))
            return probe.getsockname()[0], 24
        except OSError:
            return "127.0.0.1", 24


def network_for(ip: str, prefix: int) -> ipaddress.IPv4Network:
    network = ipaddress.ip_network(f"{ip}/{prefix}", strict=False)
    if network.num_addresses > MAX_HOSTS:
        network = ipaddress.ip_network(f"{ip}/24", strict=False)
    return network


def nmap_sweep(network: str) -> dict[str, str]:
    """Ping sweep. Returns ip -> hostname (empty when nmap has no name)."""
    binary = shutil.which("nmap")
    if not binary:
        return {}
    try:
        result = subprocess.run(
            [
                binary,
                "-sn",
                "-T4",
                "--max-retries",
                "1",
                "--host-timeout",
                "12s",
                "-PE",
                "-PS22,80,443,11434",
                network,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError):
        return {}

    found: dict[str, str] = {}
    for line in result.stdout.splitlines():
        match = re.match(r"Nmap scan report for (.+)$", line)
        if not match:
            continue
        text = match.group(1).strip()
        named = re.match(r"(.+?) \((\d+\.\d+\.\d+\.\d+)\)$", text)
        if named:
            found[named.group(2)] = named.group(1)
        elif re.fullmatch(r"\d+\.\d+\.\d+\.\d+", text):
            found[text] = ""
    return found


def arp_hosts() -> dict[str, str]:
    """Hosts already in the neighbour table — catches whatever nmap skipped."""
    try:
        output = subprocess.run(
            ["ip", "neigh", "show"],
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return {}

    found: dict[str, str] = {}
    for line in output.splitlines():
        match = re.match(r"(\d+\.\d+\.\d+\.\d+)\b.*lladdr [0-9a-f:]+", line)
        if match and "FAILED" not in line:
            found[match.group(1)] = ""
    return found


def tcp_open(ip: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(PORT_TIMEOUT)
        try:
            return sock.connect_ex((ip, port)) == 0
        except OSError:
            return False


def get_json(url: str) -> object | None:
    request = urllib.request.Request(url, headers={"User-Agent": "tokentank-scan"})
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError):
        return None


def human_size(size: int) -> str:
    if not size:
        return ""
    if size >= 1_000_000_000:
        return f"{size / 1_000_000_000:.2f} GB"
    return f"{size / 1_000_000:.0f} MB"


def ollama_inventory(ip: str) -> tuple[str | None, list[dict[str, str]]]:
    tags = get_json(f"http://{ip}:{OLLAMA_PORT}/api/tags")
    if not isinstance(tags, dict):
        return None, []

    version = get_json(f"http://{ip}:{OLLAMA_PORT}/api/version")
    label = "Ollama"
    if isinstance(version, dict) and version.get("version"):
        label = f"Ollama {version['version']}"

    models: list[dict[str, str]] = []
    for entry in tags.get("models") or []:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name") or entry.get("model")
        if not name:
            continue
        details = entry.get("details") or {}
        bits = [
            str(details.get("parameter_size") or ""),
            human_size(int(entry.get("size") or 0)),
            str(details.get("quantization_level") or ""),
        ]
        models.append({"name": name, "note": " · ".join(part for part in bits if part)})

    return label, models


def openai_inventory(ip: str, port: int) -> tuple[str | None, list[dict[str, str]]]:
    data = get_json(f"http://{ip}:{port}/v1/models")
    if not isinstance(data, dict):
        return None, []

    models = [
        {"name": str(entry["id"]), "note": f"OpenAI-compatible API on :{port}"}
        for entry in data.get("data") or []
        if isinstance(entry, dict) and entry.get("id")
    ]
    return f"OpenAI-compatible API :{port}", models


def reverse_name(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0].split(".")[0]
    except OSError:
        return ""


def scan_device(ip: str, hostname: str) -> dict[str, object]:
    open_ports = [port for port in API_PORTS if tcp_open(ip, port)]
    agent: str | None = None
    models: list[dict[str, str]] = []
    reachable = False
    api_port: int | None = None

    if OLLAMA_PORT in open_ports:
        label, inventory = ollama_inventory(ip)
        if label is not None:
            agent, models, reachable, api_port = label, inventory, True, OLLAMA_PORT

    if agent is None:
        for port in open_ports:
            if port == OLLAMA_PORT:
                continue
            label, inventory = openai_inventory(ip, port)
            if label is not None:
                agent, models, reachable, api_port = label, inventory, True, port
                break

    if agent is None and OLLAMA_PORT in open_ports:
        agent, api_port = "Ollama (no answer)", OLLAMA_PORT

    return {
        "ip": ip,
        "hostname": hostname,
        "openPorts": open_ports,
        "agent": agent,
        "port": api_port,
        "reachable": reachable,
        "models": models,
    }


def scan_network() -> dict[str, object]:
    local_ip, prefix = local_ip_and_prefix()
    network = network_for(local_ip, prefix)

    hosts = nmap_sweep(str(network))
    for ip in arp_hosts():
        if ipaddress.ip_address(ip) in network:
            hosts.setdefault(ip, "")
    hosts[local_ip] = hosts.get(local_ip) or socket.gethostname()

    def inspect(ip: str) -> dict[str, object]:
        return scan_device(ip, hosts.get(ip) or reverse_name(ip))

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        devices = list(pool.map(inspect, list(hosts)))

    devices.sort(key=lambda device: tuple(int(part) for part in str(device["ip"]).split(".")))

    return {
        "mode": "local",
        "scannedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "subnet": str(network),
        "localIp": local_ip,
        "devices": devices,
    }


def scan_self() -> dict[str, object]:
    """Cloud mode: read this server's own model endpoints, nothing on the LAN."""
    name = socket.gethostname()
    local_ip, _ = local_ip_and_prefix()
    device = scan_device("127.0.0.1", name)
    device["ip"] = "127.0.0.1"
    # Read means read: there may simply be no model server on this box.
    device["reachable"] = True
    return {
        "mode": "cloud",
        "scannedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "subnet": "",
        "localIp": local_ip,
        "hostname": name,
        "devices": [device],
    }


def ssh_key_path() -> str | None:
    for name in ("id_ed25519", "id_ecdsa", "id_rsa"):
        path = os.path.expanduser(f"~/.ssh/{name}")
        if os.path.exists(f"{path}.pub"):
            return f"{path}.pub"
    return None


def public_key() -> str:
    path = ssh_key_path()
    if not path:
        return ""
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def check_ssh(payload: dict[str, object]) -> dict[str, object]:
    """Try a non-interactive SSH login and report what happened."""
    host = str(payload.get("host") or "").strip()
    user = str(payload.get("user") or "").strip()
    port = str(payload.get("port") or "").strip() or "22"
    command = str(payload.get("command") or "").strip()
    key = public_key()

    def answer(ok: bool, detail: str, target: str, ran: str) -> dict[str, object]:
        return {
            "ok": ok,
            "target": target,
            "detail": detail[:800],
            "command": ran,
            "publicKey": key,
        }

    if command:
        if any(char in SSH_FORBIDDEN for char in command):
            return answer(
                False,
                "The SSH command may not contain ; | & $ ` < > or newlines.",
                "",
                command,
            )
        try:
            parts = shlex.split(command)
        except ValueError:
            return answer(False, "That SSH command could not be parsed.", "", command)
        if not parts or os.path.basename(parts[0]) != "ssh":
            return answer(False, "The command has to start with ssh.", "", command)
        if any(option in command.lower() for option in SSH_BANNED_OPTIONS):
            return answer(
                False,
                "ProxyCommand and LocalCommand are not allowed here.",
                "",
                command,
            )
        target = parts[-1] if parts[-1] and not parts[-1].startswith("-") else host
        args = parts
    else:
        if not host:
            return answer(False, "Give the machine a hostname or IP address.", "", "")
        if not re.fullmatch(r"[A-Za-z0-9._:\[\]-]+", host):
            return answer(False, "That hostname has characters SSH does not accept.", host, "")
        target = f"{user}@{host}" if user else host
        args = ["ssh", "-p", port, target]

    remote = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "StrictHostKeyChecking=accept-new",
        *args[1:],
        "true",
    ]
    ran = " ".join(remote)
    try:
        result = subprocess.run(remote, capture_output=True, text=True, timeout=SSH_TIMEOUT)
    except subprocess.TimeoutExpired:
        return answer(False, f"No answer within {SSH_TIMEOUT} seconds.", target, ran)
    except OSError as error:
        return answer(False, f"Could not run ssh: {error}", target, ran)

    if result.returncode == 0:
        return answer(True, "Connected.", target, ran)
    detail = (result.stderr or result.stdout).strip() or f"ssh exited with code {result.returncode}."
    return answer(False, detail, target, ran)


def scan_cached(force: bool, cloud: bool = False) -> dict[str, object]:
    with _cache_lock:
        cached = _cache["payload"]
        fresh = time.time() - float(_cache["at"]) < CACHE_SECONDS
    if isinstance(cached, dict) and fresh and not force:
        return cached

    with _scan_lock:
        with _cache_lock:
            cached = _cache["payload"]
            fresh = time.time() - float(_cache["at"]) < CACHE_SECONDS
        if isinstance(cached, dict) and fresh and not force:
            return cached

        payload = scan_self() if cloud else scan_network()
        with _cache_lock:
            _cache["payload"] = payload
            _cache["at"] = time.time()
        return payload


class Handler(SimpleHTTPRequestHandler):
    server_version = "TokenTank/1.0"
    cloud_mode = False
    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def same_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return urlparse(origin).netloc == (self.headers.get("Host") or "")

    def do_POST(self) -> None:  # noqa: N802 - http.server naming
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/api/ssh/check":
            self.send_error(404)
            return
        if not self.same_origin():
            self.send_json({"error": "Cross-origin request refused."}, 403)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > 8192:
            self.send_json({"error": "Request too large."}, 413)
            return
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self.send_json({"error": "Invalid JSON."}, 400)
            return
        if not isinstance(payload, dict):
            self.send_json({"error": "A JSON object is expected."}, 400)
            return
        self.send_json(check_ssh(payload))

    def do_GET(self) -> None:  # noqa: N802 - http.server naming
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") == "/api/ssh/identity":
            self.send_json({"publicKey": public_key(), "path": ssh_key_path()})
            return
        if parsed.path.rstrip("/") == "/api/scan":
            refresh = parse_qs(parsed.query).get("refresh", ["0"])[0]
            self.send_scan(force=refresh not in ("", "0", "false"))
            return
        super().do_GET()

    def send_scan(self, force: bool) -> None:
        try:
            payload: dict[str, object] = scan_cached(force, self.cloud_mode)
        except Exception as error:  # noqa: BLE001 - surface the reason to the panel
            body = json.dumps({"error": str(error)}).encode("utf-8")
            self.send_response(500)
        else:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)

        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        if "/api/scan" in self.path:
            print(f"{self.address_string()} - scan", flush=True)
        else:
            super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="TokenTank panel + LAN scanner")
    parser.add_argument("--port", type=int, default=8094)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--directory", default="dist")
    parser.add_argument(
        "--cloud",
        action="store_true",
        help="read only this server instead of scanning the local network",
    )
    args = parser.parse_args()

    Handler.cloud_mode = args.cloud
    handler = functools.partial(Handler, directory=args.directory)
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    scope = "this server only" if args.cloud else "local network"
    print(
        f"Serving {args.directory} on http://{args.bind}:{args.port} — "
        f"scan ({scope}) at /api/scan, ssh check at /api/ssh/check",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
