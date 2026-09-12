"""
Authentication & JWT Middleware — Managed Supabase Auth Integration.

Provides async authentication helper functions that route signup and login
directly through Supabase's Auth REST API, and a FastAPI dependency
(`get_current_user`) for validating Bearer JWT tokens against SUPABASE_JWT_SECRET.

Security hardening:
- Supabase calls use async httpx (event-loop safe, no thread blocking)
- load_dotenv() consolidated to main.py; removed here to avoid double-load
- print() replaced with logging (masked values only)
"""

import base64
import logging
import os
from typing import Dict, Any, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_JWT_SECRET_RAW = os.getenv("SUPABASE_JWT_SECRET", "").strip()

# Supabase signs HS256 JWTs with the raw secret string (UTF-8)
SUPABASE_JWT_SECRET = SUPABASE_JWT_SECRET_RAW

security = HTTPBearer(auto_error=False)


def _mask(val: str) -> str:
    """Return masked string preview for logging (first 4 chars + ****)."""
    return f"{val[:4]}****" if val and len(val) >= 4 else "(not set)"


async def supabase_signup(email: str, password: str) -> Dict[str, Any]:
    """Register a new user via real Supabase Auth REST API (async)."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase credentials (SUPABASE_URL, SUPABASE_ANON_KEY) are not configured in .env",
        )

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/signup"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }
    payload = {"email": email, "password": password}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json=payload, headers=headers)
        data = res.json()
        if res.status_code >= 400:
            msg = data.get("msg") or data.get("error_description") or data.get("message") or "Signup failed"
            raise HTTPException(status_code=res.status_code, detail=msg)

        user_data = data.get("user") or {}
        session = data.get("session") or {}
        access_token = data.get("access_token") or session.get("access_token") or ""
        refresh_token = data.get("refresh_token") or session.get("refresh_token") or ""
        expires_in = data.get("expires_in") or session.get("expires_in")

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "refresh_token": refresh_token,
            "expires_in": expires_in,
            "user": {
                "id": user_data.get("id", ""),
                "email": user_data.get("email", email),
            },
        }
    except HTTPException:
        raise
    except httpx.RequestError as e:
        logger.error("Supabase signup network error: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to communicate with Supabase Auth service.",
        )


async def supabase_login(email: str, password: str) -> Dict[str, Any]:
    """Authenticate an existing user via real Supabase Auth REST API (async)."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase credentials (SUPABASE_URL, SUPABASE_ANON_KEY) are not configured in .env",
        )

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }
    payload = {"email": email, "password": password}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json=payload, headers=headers)
        data = res.json()
        if res.status_code >= 400:
            msg = data.get("error_description") or data.get("msg") or data.get("message") or "Invalid login credentials"
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=msg)

        user_data = data.get("user") or {}
        access_token = data.get("access_token") or ""
        refresh_token = data.get("refresh_token") or ""
        expires_in = data.get("expires_in")

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "refresh_token": refresh_token,
            "expires_in": expires_in,
            "user": {
                "id": user_data.get("id", ""),
                "email": user_data.get("email", email),
            },
        }
    except HTTPException:
        raise
    except httpx.RequestError as e:
        logger.error("Supabase login network error: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to communicate with Supabase Auth service.",
        )


_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        sb_url = os.getenv("SUPABASE_URL", "").strip() or SUPABASE_URL
        if sb_url:
            jwks_url = f"{sb_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
            # Explicit 5.0 second timeout to prevent hanging on unresponsive JWKS endpoints
            _jwks_client = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=3600, timeout=5.0)
    return _jwks_client


def warm_jwks_cache() -> bool:
    """Pre-fetch and cache Supabase JWKS signing keys during startup.
    
    Prevents first user request from paying network latency overhead.
    Fails gracefully if network is unreachable without blocking boot.
    """
    try:
        client = _get_jwks_client()
        if client:
            client.fetch_data()
            logger.info("Supabase JWKS signing keys pre-warmed successfully.")
            return True
    except Exception as exc:
        logger.warning("Supabase JWKS key pre-warm non-fatal warning: %s", exc)
    return False


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Dict[str, Any]:
    """FastAPI dependency that extracts and validates the Bearer JWT token.

    Supports modern Supabase ES256/RS256 asymmetric keys via JWKS with HS256 shared secret fallback.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Header Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    secret = os.getenv("SUPABASE_JWT_SECRET", "").strip() or SUPABASE_JWT_SECRET

    # Inspect token algorithm from header
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
    except Exception as exc:
        logger.warning("Invalid JWT header: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = None

    # Handle asymmetric signing (ES256 / RS256) via Supabase JWKS
    if alg in ["ES256", "RS256"]:
        try:
            jwks = _get_jwks_client()
            if jwks:
                signing_key = jwks.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[alg],
                    options={"verify_aud": False},
                )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as exc:
            logger.warning("JWKS verification failed for %s token: %s", alg, exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Fallback to symmetric HS256 validation
    if payload is None:
        if not secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="SUPABASE_JWT_SECRET is not configured in .env",
            )
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except jwt.InvalidSignatureError:
            try:
                b64_secret = base64.b64decode(secret)
                payload = jwt.decode(
                    token,
                    b64_secret,
                    algorithms=["HS256"],
                    options={"verify_aud": False},
                )
            except Exception as exc:
                logger.warning("JWT signature verification failed: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired authentication token.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.PyJWTError as exc:
            logger.warning("JWT decoding failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return {
        "id": payload.get("sub", ""),
        "email": payload.get("email", ""),
    }


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[Dict[str, Any]]:
    """FastAPI dependency that extracts and validates the Bearer JWT token if present.
    
    Returns None if missing, expired, or invalid so public/general queries succeed.
    """
    if not credentials or not credentials.credentials:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None
    except Exception:
        return None
