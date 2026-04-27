from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_exp_minutes: int = 60


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is not None:
        return _settings

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    jwt_secret = os.getenv("JWT_SECRET")

    print(supabase_url, supabase_key, jwt_secret)

    missing = [
        name
        for name, value in (
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_KEY", supabase_key),
            ("JWT_SECRET", jwt_secret),
        )
        if not value
    ]

    if missing:
        missing_str = ", ".join(missing)
        raise RuntimeError(f"Missing required environment variables: {missing_str}")

    _settings = Settings(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        jwt_secret=jwt_secret,
    )
    return _settings
