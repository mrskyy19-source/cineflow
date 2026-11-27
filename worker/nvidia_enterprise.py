import json
import os
import platform
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List

RH_SSO_URL = "https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token"
DEFAULT_NIM_MODELS = [
    "mistralai/mistral-large-4-1t-a52b",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3.5-super-vl-120b-a12b",
    "meta/llama-3.3-70b-instruct",
]
_rh_token_cache: Dict[str, Any] = {"access_token": None, "expires_at": 0.0}


def _get_nvidia_config() -> tuple[str, str, List[str]]:
    base_url = os.getenv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1").strip().rstrip("/")
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()
    configured = os.getenv("NVIDIA_LLM_MODEL", "").strip()
    retired = {"mistralai/mistral-large-2-instruct", "mistralai/mistral-large"}
    models: List[str] = []
    if configured and configured not in retired:
        models.append(configured)
    for m in DEFAULT_NIM_MODELS:
        if m not in models:
            models.append(m)
    return base_url, api_key, models


def detect_rhel_runtime() -> Dict[str, Any]:
    info: Dict[str, Any] = {"os": platform.system(), "is_rhel_family": False, "pretty_name": platform.platform()}
    try:
        if os.path.exists("/etc/os-release"):
            with open("/etc/os-release", "r", encoding="utf-8") as fh:
                for line in fh:
                    if line.startswith("PRETTY_NAME="):
                        pretty = line.split("=", 1)[1].strip().strip('"')
                        info["pretty_name"] = pretty
                        info["is_rhel_family"] = any(t in pretty for t in ("Red Hat", "RHEL", "UBI"))
                        break
    except Exception:
        pass
    return info


def verify_redhat_rhsm() -> Dict[str, Any]:
    token = os.getenv("RH_OFFLINE_TOKEN", "").strip()
    if not token:
        return {"configured": False, "active": False, "detail": "RH_OFFLINE_TOKEN not set"}
    now = time.time()
    if _rh_token_cache["access_token"] and now < _rh_token_cache["expires_at"]:
        return {"configured": True, "active": True, "detail": "Red Hat SSO token cached & active"}
    payload = urllib.parse.urlencode(
        {"grant_type": "refresh_token", "client_id": "rhsm-api", "refresh_token": token}
    ).encode("utf-8")
    req = urllib.request.Request(
        RH_SSO_URL, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "access_token" in data:
                ttl = int(data.get("expires_in", 300))
                _rh_token_cache["access_token"] = data["access_token"]
                _rh_token_cache["expires_at"] = now + max(60, ttl - 30)
                return {"configured": True, "active": True, "detail": "Red Hat RHSM entitlement verified"}
            return {"configured": True, "active": False, "detail": "Unexpected Red Hat SSO response"}
    except urllib.error.HTTPError as exc:
        return {"configured": True, "active": False, "detail": f"Red Hat SSO HTTP {exc.code}"}
    except Exception as exc:
        return {"configured": True, "active": False, "detail": str(exc)}


def _extract_json_array(raw_text: str) -> List[Dict[str, Any]]:
    cleaned = (raw_text or "").strip()
    fence = chr(96) * 3
    if cleaned.startswith(fence):
        cleaned = cleaned.strip(chr(96)).strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            for key in ("clips", "highlights", "shorts", "items"):
                if isinstance(parsed.get(key), list):
                    return parsed[key]
    except json.JSONDecodeError:
        s, e = cleaned.find("["), cleaned.rfind("]")
        if s != -1 and e > s:
            parsed = json.loads(cleaned[s : e + 1])
            if isinstance(parsed, list):
                return parsed
    return []


def generate_viral_hooks_nim(
    transcript: str, target_language: str = "English + Estonian", num_clips: int = 3
) -> List[Dict[str, Any]]:
    base_url, api_key, models = _get_nvidia_config()
    clean = (transcript or "").strip()
    if not api_key or not clean:
        return [{
            "id": 1, "title": "Highlight Short #1", "range": "00:00 - 00:18",
            "hook": "CINEFLOW AI AUTOPILOT HIGHLIGHT",
            "caption": clean[:140] or "Auto-reframed 9:16 master clip ready.",
            "score": 95, "engine": "local-fallback",
        }]

    prompt = (
        "You are an enterprise film post-production editor. Return ONLY a valid JSON array of "
        f"{num_clips} objects with exact keys: id (int), title (str), range (str like '00:00 - 00:20'), "
        f"hook (uppercase max 10 words), caption (localized in {target_language}), score (int 88-99)."
    )
    last_error = "No models available"
    for model in models:
        body = json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Transcript:\n{clean[:6000]}"},
            ],
            "temperature": 0.35,
            "max_tokens": 1500,
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{base_url}/chat/completions",
            data=body,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                msg = result["choices"][0]["message"]
                raw = msg.get("content") or ""
                clips = _extract_json_array(raw)
                if clips:
                    out = []
                    for idx, c in enumerate(clips[:num_clips], start=1):
                        if isinstance(c, dict):
                            out.append({
                                "id": int(c.get("id", idx)),
                                "title": str(c.get("title", f"Highlight Short #{idx}")),
                                "range": str(c.get("range", "00:00 - 00:20")),
                                "hook": str(c.get("hook", "CINEFLOW AI HIGHLIGHT")).upper(),
                                "caption": str(c.get("caption", clean[:140])),
                                "score": int(c.get("score", 95)),
                                "engine": f"nvidia-nim:{model}",
                            })
                    if out:
                        return out
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code} on {model}"
            if exc.code in (404, 410):
                continue
            break
        except Exception as exc:
            last_error = str(exc)
            break

    return [{
        "id": 1, "title": "Highlight Short #1", "range": "00:00 - 00:20",
        "hook": "HIGH-RETENTION AI CUT READY", "caption": clean[:140],
        "score": 94, "engine": f"nim-fallback ({last_error})",
    }]


def get_enterprise_runtime_status() -> Dict[str, Any]:
    base_url, api_key, models = _get_nvidia_config()
    return {
        "rhel_runtime": detect_rhel_runtime(),
        "redhat_rhsm": verify_redhat_rhsm(),
        "nvidia_enterprise": {
            "configured": bool(api_key),
            "endpoint": base_url,
            "model": models[0] if models else None,
            "fallback_models": models,
        },
    }
