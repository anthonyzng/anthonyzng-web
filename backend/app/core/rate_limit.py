"""In-process sliding-window rate limiter.

Each key holds a deque of event timestamps. A request is rejected when the deque already holds
`limit` events younger than `window`; rejected requests are not recorded, so a flood cannot
extend its own block. `Retry-After` is the time until the oldest counted event leaves the window.

Limitation: the state lives in this process only. Phase 4/6 run a single Uvicorn worker, so this
is exact; running several workers or replicas would give each its own counters (a shared store
such as Redis is a later decision).
"""

import math
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import NamedTuple


class RateLimitRule(NamedTuple):
    limit: int
    window_seconds: float


CONTACT_IP_RULE = RateLimitRule(limit=5, window_seconds=900)
LOGIN_IP_RULE = RateLimitRule(limit=10, window_seconds=900)
LOGIN_EMAIL_RULE = RateLimitRule(limit=5, window_seconds=900)

_SWEEP_EVERY = 1000


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    allowed: bool
    retry_after: int  # whole seconds (>= 1) when rejected, 0 when allowed


class SlidingWindowRateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._events: dict[str, deque[float]] = {}
        self._operations = 0

    def check(self, key: str, rule: RateLimitRule) -> RateLimitDecision:
        """Decide without recording an event."""
        now = self._clock()
        self._tick(now)
        events = self._prune(key, now, rule.window_seconds)
        if events is None or len(events) < rule.limit:
            return RateLimitDecision(allowed=True, retry_after=0)
        retry_after = max(1, math.ceil(events[0] + rule.window_seconds - now))
        return RateLimitDecision(allowed=False, retry_after=retry_after)

    def record(self, key: str, rule: RateLimitRule) -> None:
        """Count one event for `key` now (used for "failed attempts only" rules)."""
        now = self._clock()
        self._tick(now)
        events = self._prune(key, now, rule.window_seconds)
        if events is None:
            events = self._events.setdefault(key, deque())
        events.append(now)

    def hit(self, key: str, rule: RateLimitRule) -> RateLimitDecision:
        """Check, and record the event when it is allowed ("counted on arrival" rules)."""
        decision = self.check(key, rule)
        if decision.allowed:
            self.record(key, rule)
        return decision

    def clear(self, key: str) -> None:
        self._events.pop(key, None)

    def reset(self) -> None:
        self._events.clear()
        self._operations = 0

    def _prune(self, key: str, now: float, window: float) -> deque[float] | None:
        events = self._events.get(key)
        if events is None:
            return None
        cutoff = now - window
        while events and events[0] <= cutoff:
            events.popleft()
        if not events:
            del self._events[key]
            return None
        return events

    def _tick(self, now: float) -> None:
        """Occasionally drop keys whose events have all expired, so memory stays bounded."""
        self._operations += 1
        if self._operations % _SWEEP_EVERY:
            return
        for key, events in list(self._events.items()):
            if not events or events[-1] <= now - _MAX_WINDOW:
                del self._events[key]


_MAX_WINDOW = max(
    CONTACT_IP_RULE.window_seconds, LOGIN_IP_RULE.window_seconds, LOGIN_EMAIL_RULE.window_seconds
)

rate_limiter = SlidingWindowRateLimiter()
"""The process-wide limiter; tests call `reset()` between cases."""
