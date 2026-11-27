"""
CineFlow Enterprise Integration Module
- NVIDIA AI Enterprise (NIM Cloud API: Viral Hook Extraction & EU Localization)
- Red Hat Enterprise Linux (RHEL UBI 9 Runtime Detection & RHSM Token Verification)

Zero external pip dependencies (uses Python standard library urllib).
Recommended Render Environment Variables (cineflow-worker-8hci):
  - NVIDIA_API_KEY       (from build.nvidia.com, starts with nvapi-)
  - NVIDIA_LLM_MODEL     (optional, default: mistralai/mistral-large-2-instruct)
  - NVIDIA_NIM_BASE_URL  (optional, default: https://integrate.api.nvidia.com/v1)
  - RH_OFFLINE_TOKEN     (optional, from access.redhat.com/management/api)
"""

import json
import os
import platform
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List

RH_SSO_URL = "https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token"

# In-memory cache for short-lived Red Hat SSO access tokens
_rh_token_cache: Dict[str, Any] = {"access_token": None, "expires_at": 0.0}


def _get_nvidia_config() -> tuple[str, str, str]:
    """Reads NVIDIA NIM configuration dynamically from environment variables."""
    base_url = os.getenv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1").strip().rstrip("/")
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()
    model = os.getenv("NVIDIA_LLM_MODEL", "mistralai/mistral-large-2-instruct").strip()
    return base_url, api_key, model


def detect_rhel_runtime() -> Dict[str, Any]:
    """Inspects /etc/os-release to verify whether the worker is running on RHEL / UBI 9."""
    info: Dict[str, Any] = {
        "os": platform.system(),
        "is_rhel_family": False,
        "pretty_name": platform.platform(),
    }
    try:
        if os.path.exists("/etc/os-release"):
            with open("/etc/os-release", "r", encoding="utf-8") as handle:
                content = handle.read()
            for line in content.splitlines():
                if line.startswith("PRETTY_NAME="):
                    pretty = line.split("=", 1)[1].strip().strip('"')
                    info["pretty_name"] = pretty
                    if any(tag in pretty for tag in ("Red Hat", "RHEL", "UBI")):
                        info["is_rhel_family"] = True
                    break
    except Exception:
        pass
    return info


def verify_redhat_rhsm() -> Dict[str, Any]:
    """
    Exchanges the Red Hat RHSM Offline Token for a short-lived access token
    to verify active Red Hat Enterprise subscription connectivity.
    """
    rh_offline_token = os.getenv("RH_OFFLINE_TOKEN", "").strip()
    if not rh_offline_token:
        return {"configured": False, "active": False, "detail": "RH_OFFLINE_TOKEN not set"}

    now = time.time()
    if _rh_token_cache["access_token"] and now < _rh_token_cache["expires_at"]:
        return {"configured": True, "active": True, "detail": "Red Hat SSO token cached & active"}

    payload = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "client_id": "rhsm-api",
            "refresh_token": rh_offline_token,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        RH_SSO_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
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
    """Safely extracts a JSON list from an LLM response even if wrapped in markdown fences."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
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
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start != -1 and end != -1 and end > start:
            parsed = json.loads(cleaned[start : end + 1])
            if isinstance(parsed, list):
                return parsed
    return []


def generate_viral_hooks_nim(
    transcript: str,
    target_language: str = "English + Estonian",
    num_clips: int = 3,
) -> List[Dict[str, Any]]:
    """
    Calls NVIDIA Enterprise NIM API to extract high-retention viral hooks,
    viral scores, and EU-localized captions from a Whisper transcript.
    Falls back cleanly if NVIDIA_API_KEY is missing or unreachable.
    """
    base_url, api_key, model = _get_nvidia_config()
    clean_transcript = (transcript or "").strip()

    if not api_key or not clean_transcript:
        return [
            {
                "id": 1,
                "title": "Highlight Short #1",
                "range": "00:00 - 00:18",
                "hook": "CINEFLOW AI AUTOPILOT HIGHLIGHT",
                "caption": clean_transcript[:140] or "Auto-reframed 9:16 master clip ready.",
                "score": 95,
                "engine": "local-fallback",
            }
        ]

    system_prompt = (
        "You are an enterprise film post-production editor and viral short-form strategist. "
        f"Analyze the transcript and return strictly valid JSON as an array of {num_clips} objects. "
        "Each object must contain exact keys: id (int), title (str), range (str like '00:00 - 00:20'), "
        "hook (short uppercase punchy hook max 10 words), caption (localized subtitle text in "
        f"{target_language}), and score (int between 88 and 99). Return ONLY the JSON array."
    )

    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Transcript:\n{clean_transcript[:6000]}"},
            ],
            "temperature": 0.35,
            "max_tokens": 900,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            raw_content = result["choices"][0]["message"]["content"]
            clips = _extract_json_array(raw_content)
            if clips:
                normalized: List[Dict[str, Any]] = []
                for idx, clip in enumerate(clips[:num_clips], start=1):
                    if not isinstance(clip, dict):
                        continue
                    normalized.append(
                        {
                            "id": int(clip.get("id", idx)),
                            "title": str(clip.get("title", f"Highlight Short #{idx}")),
                            "range": str(clip.get("range", "00:00 - 00:20")),
                            "hook": str(clip.get("hook", "CINEFLOW AI HIGHLIGHT")).upper(),
                            "caption": str(clip.get("caption", clean_transcript[:140])),
                            "score": int(clip.get("score", 95)),
                            "engine": f"nvidia-nim:{model}",
                        }
                    )
                if normalized:
                    return normalized
    except Exception as exc:
        return [
            {
                "id": 1,
                "title": "Highlight Short #1",
                "range": "00:00 - 00:20",
                "hook": "HIGH-RETENTION AI CUT READY",
                "caption": clean_transcript[:140],
                "score": 94,
                "engine": f"nim-fallback ({exc})",
            }
        ]

    return [
        {
            "id": 1,
            "title": "Highlight Short #1",
            "range": "00:00 - 00:20",
            "hook": "CINEFLOW AI AUTOPILOT HIGHLIGHT",
            "caption": clean_transcript[:140],
            "score": 94,
            "engine": "nim-empty-fallback",
        }
    ]


def get_enterprise_runtime_status() -> Dict[str, Any]:
    """Returns a combined health/status payload for CineFlow's enterprise dashboard."""
    base_url, api_key, model = _get_nvidia_config()
    return {
        "rhel_runtime": detect_rhel_runtime(),
        "redhat_rhsm": verify_redhat_rhsm(),
        "nvidia_enterprise": {
            "configured": bool(api_key),
            "endpoint": base_url,
            "model": model,
        },
    }
