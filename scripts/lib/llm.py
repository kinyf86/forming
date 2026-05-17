"""Unified LLM backend abstraction.

Both Claude Code CLI and Ollama local models are called through this module,
so any generation script can swap backends without changing prompt logic.

Usage:
    from lib.llm import call_llm, parse_json

    result = call_llm(prompt, backend="gemma26b", timeout=240)
    obj = parse_json(result)

Supported backends:
    claude        — Claude Code CLI (claude -p, sonnet 4.6)
    gemma:e4b     — Ollama gemma4:e4b (fast, basic quality)
    gemma:26b     — Ollama gemma4:26b MoE (recommended — fast + good quality)
    gemma:31b     — Ollama gemma4:31b Dense (slow, highest quality)
"""

import json
import re
import subprocess
import time
import urllib.request
from typing import Optional


OLLAMA_ENDPOINT = "http://localhost:11434/api/generate"

MODEL_MAP = {
    "claude": "claude-sonnet-4-6",
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6",
    "haiku": "claude-haiku-4-5",
    "gemma:e4b": "gemma4:e4b",
    "gemma:26b": "gemma4:26b",
    "gemma:31b": "gemma4:31b",
}

DEFAULT_BACKEND = "gemma:26b"


class LLMError(Exception):
    """Raised when all retry attempts fail."""


def call_llm(
    prompt: str,
    backend: str = DEFAULT_BACKEND,
    timeout: int = 240,
    retries: int = 2,
    temperature: float = 0.7,
    num_ctx: int = 8192,
    keep_alive: str = "30m",
    silent_retry: bool = False,
    isolate_cwd: bool = False,
) -> Optional[str]:
    """Call an LLM backend and return the raw text response.

    Returns None after all retries fail. Does not raise.
    Callers should check for None and decide how to handle it.

    `isolate_cwd=True` runs the claude CLI from /tmp so it does NOT
    auto-load forming's CLAUDE.md and reinterpret the prompt as a coding
    request. Required for review / generation prompts.
    """
    if backend not in MODEL_MAP:
        raise ValueError(
            f"Unknown backend: {backend}. Supported: {list(MODEL_MAP.keys())}"
        )

    for attempt in range(retries):
        try:
            if backend in ("claude", "sonnet", "opus", "haiku"):
                return _call_claude(
                    prompt,
                    timeout,
                    MODEL_MAP[backend],
                    isolate_cwd=isolate_cwd,
                )
            else:
                return _call_ollama(
                    prompt,
                    MODEL_MAP[backend],
                    timeout=timeout,
                    temperature=temperature,
                    num_ctx=num_ctx,
                    keep_alive=keep_alive,
                )
        except (subprocess.TimeoutExpired, TimeoutError, urllib.error.URLError) as e:
            if not silent_retry:
                print(f"(retry {attempt + 1}: {type(e).__name__}) ", end="", flush=True)
            if attempt < retries - 1:
                time.sleep(5)
        except Exception as e:
            if not silent_retry:
                print(f"(error {attempt + 1}: {type(e).__name__}) ", end="", flush=True)
            if attempt < retries - 1:
                time.sleep(5)
    return None


def _call_claude(
    prompt: str,
    timeout: int,
    model: str = "claude-sonnet-4-6",
    isolate_cwd: bool = False,
) -> str:
    kwargs = {
        "capture_output": True,
        "text": True,
        "timeout": timeout,
        "stdin": subprocess.DEVNULL,
    }
    if isolate_cwd:
        import tempfile
        kwargs["cwd"] = tempfile.gettempdir()
    result = subprocess.run(
        [
            "claude",
            "-p",
            prompt,
            "--output-format",
            "text",
            "--model",
            model,
        ],
        **kwargs,
    )
    return result.stdout.strip()


def _call_ollama(
    prompt: str,
    model: str,
    timeout: int,
    temperature: float,
    num_ctx: int,
    keep_alive: str = "30m",
) -> str:
    body = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "keep_alive": keep_alive,
            "options": {
                "temperature": temperature,
                "num_ctx": num_ctx,
            },
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_ENDPOINT,
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read())
    return data.get("response", "").strip()


def parse_json(text: Optional[str]) -> Optional[dict]:
    """Extract and parse JSON from an LLM response.

    Handles common wrapping issues:
      - Markdown code fences (```json ... ```)
      - Leading/trailing prose
      - Control characters inside strings (strict=False)
      - Invalid JSON escape sequences from LaTeX (e.g. \\% \\$ \\( \\))
        — these are common when LLMs emit LaTeX inside JSON strings.
    """
    if not text:
        return None

    cleaned = text.strip()
    cleaned = re.sub(r"^```json?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    # Find the outermost JSON object
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        return None

    raw = match.group()

    # First try: direct parse (strict=False allows control chars)
    try:
        return json.loads(raw, strict=False)
    except json.JSONDecodeError:
        pass

    # Second try: fix invalid JSON escape sequences
    # Valid JSON escapes: \" \\ \/ \b \f \n \r \t \uXXXX
    # LLMs often emit LaTeX-style bare backslashes like \% \$ \& \( \) \[ \]
    # Strategy: double any backslash that's not followed by a valid JSON escape char
    valid_next = set('"\\/bfnrtu')
    fixed_chars = []
    i = 0
    while i < len(raw):
        c = raw[i]
        if c == "\\" and i + 1 < len(raw):
            nxt = raw[i + 1]
            if nxt in valid_next:
                # Valid escape — keep as-is
                fixed_chars.append(c)
                fixed_chars.append(nxt)
                i += 2
                continue
            else:
                # Invalid escape — double the backslash
                fixed_chars.append("\\\\")
                i += 1
                continue
        fixed_chars.append(c)
        i += 1

    fixed = "".join(fixed_chars)
    try:
        return json.loads(fixed, strict=False)
    except json.JSONDecodeError:
        return None


def get_backend_info(backend: str) -> dict:
    """Return metadata about a backend for logging."""
    info = {
        "claude": {
            "name": "Claude Code CLI (Sonnet 4.6)",
            "speed": "variable (60-180s)",
            "quality": "high",
            "cost": "subscription",
        },
        "opus": {
            "name": "Claude Code CLI (Opus 4.6)",
            "speed": "variable (30-120s)",
            "quality": "highest",
            "cost": "subscription",
        },
        "gemma:e4b": {
            "name": "Gemma 4 E4B",
            "speed": "~35s",
            "quality": "basic",
            "cost": "free (local)",
        },
        "gemma:26b": {
            "name": "Gemma 4 26B MoE",
            "speed": "~50s",
            "quality": "good",
            "cost": "free (local)",
        },
        "gemma:31b": {
            "name": "Gemma 4 31B Dense",
            "speed": "~160s",
            "quality": "highest",
            "cost": "free (local)",
        },
    }
    return info.get(backend, {"name": backend})
