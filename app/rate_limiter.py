"""
In-Memory Rate Limiter for API Routes.

Implements a sliding-window rate limiter per client IP.
Memory-safe: expired IP entries are pruned on every check so the
history dict does not grow unboundedly under sustained traffic.
"""

import os
import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status


class RateLimiter:
    """Thread-safe sliding window rate limiter with automatic pruning."""

    def __init__(self, requests_per_window: int = 10, window_seconds: int = 60):
        self.requests_per_window = requests_per_window
        self.window_seconds = window_seconds
        self.history: dict[str, list[float]] = defaultdict(list)
        self.lock = Lock()

    def check(self, request: Request) -> None:
        """Check if request exceeds rate limit for client IP.

        Also prunes stale entries for IPs whose entire window has expired,
        preventing unbounded dict growth.
        """
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        window_start = now - self.window_seconds

        with self.lock:
            # Filter timestamps outside the sliding window
            self.history[client_ip] = [t for t in self.history[client_ip] if t > window_start]

            # Prune stale IPs (all timestamps expired) to prevent memory leak
            stale = [ip for ip, ts in self.history.items() if not ts]
            for ip in stale:
                del self.history[ip]

            timestamps = self.history[client_ip]

            if len(timestamps) >= self.requests_per_window:
                retry_after = int(timestamps[0] + self.window_seconds - now) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded (max {self.requests_per_window} requests/{self.window_seconds}s). Retry in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )

            self.history[client_ip].append(now)


# Global instances
# AI Agent routes: configurable via AI_RATE_LIMIT (default 60 calls / 60 seconds for smooth demo)
ai_rate_limiter = RateLimiter(
    requests_per_window=int(os.getenv("AI_RATE_LIMIT", "60")),
    window_seconds=60
)

# Auth routes: configurable via AUTH_RATE_LIMIT (default 30 attempts / 60 seconds)
auth_rate_limiter = RateLimiter(
    requests_per_window=int(os.getenv("AUTH_RATE_LIMIT", "30")),
    window_seconds=60
)

# Upload routes: configurable via UPLOAD_RATE_LIMIT (default 30 uploads / 60 seconds)
upload_rate_limiter = RateLimiter(
    requests_per_window=int(os.getenv("UPLOAD_RATE_LIMIT", "30")),
    window_seconds=60
)
