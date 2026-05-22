from __future__ import annotations
from supabase import create_client, Client
from app.core.config import get_settings


def get_supabase_client() -> Client:
    """Create a fresh Supabase client each call to avoid HTTP/2 stale connection errors."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)