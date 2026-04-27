from __future__ import annotations

from typing import Optional

from supabase import Client, create_client

from app.core.config import get_settings

_supabase: Optional[Client] = None


def get_supabase_client() -> Client:
    global _supabase
    if _supabase is not None:
        return _supabase

    settings = get_settings()
    _supabase = create_client(settings.supabase_url, settings.supabase_key)
    return _supabase
