#!/usr/bin/env python3
"""PerezDev local engine.

Reads one JSON request per line from stdin and writes one JSON response per
line to stdout. Stdlib only, Python 3.8+. Each request: {"id", "op", "params"}.
Each response: {"id", "ok", "result"} or {"id", "ok": false, "error"}.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")

PY_FRAME = re.compile(r'File "([^"]+)", line (\d+)')
JS_FRAME = re.compile(r'\(?([\/\w.\-]+\.(?:js|ts|tsx|jsx)):(\d+):(\d+)\)?')
SKIP_DIRS = {".git", "node_modules", "dist", ".venv", "__pycache__", ".next", "build"}


def read_snippet(path, line, radius=3):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except OSError:
        return None
    start = max(0, line - radius - 1)
    end = min(len(lines), line + radius)
    out = []
    for i in range(start, end):
        marker = ">" if i + 1 == line else " "
        out.append("%s %4d | %s" % (marker, i + 1, lines[i].rstrip("\n")))
    return "\n".join(out)


def diagnose(params):
    text = params.get("text") or ""
    if params.get("file"):
        with open(params["file"], "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    frames = []
    for m in PY_FRAME.finditer(text):
        frames.append({"file": m.group(1), "line": int(m.group(2))})
    for m in JS_FRAME.finditer(text):
        frames.append({"file": m.group(1), "line": int(m.group(2))})

    last = text.strip().splitlines()[-1] if text.strip() else ""
    findings = []
    seen = set()
    for fr in frames:
        key = (fr["file"], fr["line"])
        if key in seen or not os.path.isfile(fr["file"]):
            continue
        seen.add(key)
        findings.append({"file": fr["file"], "line": fr["line"], "snippet": read_snippet(fr["file"], fr["line"])})

    return {
        "message": last,
        "kind": _classify(last),
        "frames": findings[:5],
        "hint": _hint(last),
    }


def _classify(msg):
    low = msg.lower()
    for key in ("modulenotfounderror", "importerror"):
        if key in low:
            return "missing-dependency"
    if "syntaxerror" in low:
        return "syntax"
    if "typeerror" in low:
        return "type"
    if "is not defined" in low or "nameerror" in low:
        return "undefined-reference"
    if "enoent" in low or "no such file" in low:
        return "missing-file"
    return "error"


def _hint(msg):
    low = msg.lower()
    m = re.search(r"no module named '([^']+)'", low)
    if m:
        return "Install the missing package: pip install %s" % m.group(1)
    m = re.search(r"cannot find module '([^']+)'", low)
    if m:
        return "Install the missing package: npm install %s" % m.group(1)
    return "Open the top frame, inspect the highlighted line, and verify inputs."


def filetree(params):
    root = params.get("dir") or "."
    max_depth = int(params.get("depth", 3))
    lines = [os.path.basename(os.path.abspath(root)) or root]

    def walk(path, prefix, depth):
        if depth > max_depth:
            return
        try:
            entries = sorted(os.listdir(path))
        except OSError:
            return
        entries = [e for e in entries if e not in SKIP_DIRS and not e.startswith(".")]
        for i, name in enumerate(entries):
            full = os.path.join(path, name)
            last = i == len(entries) - 1
            branch = "└── " if last else "├── "
            lines.append(prefix + branch + name)
            if os.path.isdir(full):
                walk(full, prefix + ("    " if last else "│   "), depth + 1)

    walk(root, "", 1)
    return {"tree": "\n".join(lines), "count": len(lines) - 1}


def ollama_tags(params):
    try:
        with urllib.request.urlopen(OLLAMA + "/api/tags", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
        return {"available": True, "models": models}
    except urllib.error.URLError as exc:
        return {"available": False, "models": [], "error": "Ollama not reachable at %s (%s)" % (OLLAMA, exc.reason)}
    except Exception as exc:
        return {"available": False, "models": [], "error": str(exc)}


def ollama_generate(params, emit):
    """Stream a completion from Ollama; emit tokens, return the full text."""
    model = params.get("model")
    if not model:
        raise ValueError("ollama_generate requires a model")
    body = {"model": model, "prompt": params.get("prompt", ""), "stream": True}
    if params.get("system"):
        body["system"] = params["system"]
    if params.get("options"):
        body["options"] = params["options"]
    req = urllib.request.Request(
        OLLAMA + "/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    parts = []
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            for line in resp:
                line = line.strip()
                if not line:
                    continue
                evt = json.loads(line.decode("utf-8"))
                tok = evt.get("response", "")
                if tok:
                    parts.append(tok)
                    emit(tok)
                if evt.get("done"):
                    break
    except urllib.error.URLError as exc:
        raise RuntimeError("Ollama not reachable at %s (%s)" % (OLLAMA, exc.reason))
    return {"model": model, "response": "".join(parts)}


OPS = {
    "ping": lambda p: {"pong": True, "python": sys.version.split()[0]},
    "diagnose": diagnose,
    "filetree": filetree,
    "ollama_tags": ollama_tags,
}
STREAM_OPS = {"ollama_generate": ollama_generate}


def main():
    out = sys.stdout
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        rid = None
        try:
            req = json.loads(raw)
            rid = req.get("id")
            op = req.get("op")
            params = req.get("params") or {}
            if op in STREAM_OPS:
                def emit(tok, _rid=rid):
                    out.write(json.dumps({"id": _rid, "chunk": tok}) + "\n")
                    out.flush()
                result = STREAM_OPS[op](params, emit)
            elif op in OPS:
                result = OPS[op](params)
            else:
                raise ValueError("unknown op: %s" % op)
            out.write(json.dumps({"id": rid, "ok": True, "result": result}) + "\n")
        except Exception as exc:  # readable error payload, never crash the loop
            out.write(json.dumps({"id": rid, "ok": False, "error": str(exc)}) + "\n")
        out.flush()


if __name__ == "__main__":
    main()
