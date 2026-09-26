from app.core.rate_limit import RateLimitRule, SlidingWindowRateLimiter

RULE = RateLimitRule(limit=3, window_seconds=60)


class Clock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def make_limiter() -> tuple[SlidingWindowRateLimiter, Clock]:
    clock = Clock()
    return SlidingWindowRateLimiter(clock), clock


def test_hit_allows_up_to_the_limit_then_rejects() -> None:
    limiter, _ = make_limiter()
    for _ in range(RULE.limit):
        assert limiter.hit("k", RULE).allowed
    decision = limiter.hit("k", RULE)
    assert not decision.allowed
    assert decision.retry_after == 60


def test_retry_after_counts_down_and_rounds_up() -> None:
    limiter, clock = make_limiter()
    for _ in range(RULE.limit):
        limiter.hit("k", RULE)
    clock.advance(30.5)
    assert limiter.hit("k", RULE).retry_after == 30
    clock.advance(29.499)
    assert limiter.hit("k", RULE).retry_after == 1


def test_rejected_requests_do_not_extend_the_block() -> None:
    limiter, clock = make_limiter()
    for _ in range(RULE.limit):
        limiter.hit("k", RULE)
    clock.advance(59)
    for _ in range(5):
        assert not limiter.hit("k", RULE).allowed
    clock.advance(1)
    assert limiter.hit("k", RULE).allowed


def test_window_slides_per_event() -> None:
    limiter, clock = make_limiter()
    limiter.hit("k", RULE)
    clock.advance(20)
    limiter.hit("k", RULE)
    limiter.hit("k", RULE)
    clock.advance(39)
    decision = limiter.hit("k", RULE)
    assert not decision.allowed
    assert decision.retry_after == 1
    clock.advance(1)
    assert limiter.hit("k", RULE).allowed
    decision = limiter.hit("k", RULE)
    assert not decision.allowed
    assert decision.retry_after == 20


def test_check_does_not_record() -> None:
    limiter, _ = make_limiter()
    for _ in range(10):
        assert limiter.check("k", RULE).allowed
    assert limiter.hit("k", RULE).allowed


def test_record_then_check_and_clear() -> None:
    limiter, _ = make_limiter()
    for _ in range(RULE.limit):
        limiter.record("k", RULE)
    assert not limiter.check("k", RULE).allowed
    limiter.clear("k")
    assert limiter.check("k", RULE).allowed


def test_keys_are_independent() -> None:
    limiter, _ = make_limiter()
    for _ in range(RULE.limit):
        limiter.hit("a", RULE)
    assert not limiter.hit("a", RULE).allowed
    assert limiter.hit("b", RULE).allowed


def test_reset_clears_everything() -> None:
    limiter, _ = make_limiter()
    for _ in range(RULE.limit):
        limiter.hit("a", RULE)
    limiter.reset()
    assert limiter.hit("a", RULE).allowed


def test_expired_keys_are_swept() -> None:
    limiter, clock = make_limiter()
    limiter.record("stale", RULE)
    clock.advance(10_000)
    for _ in range(1_000):
        limiter.check("other", RULE)
    assert "stale" not in limiter._events


def test_the_sweep_keeps_each_key_for_its_own_window() -> None:
    limiter, clock = make_limiter()
    short = RateLimitRule(limit=5, window_seconds=900)
    daily = RateLimitRule(limit=5, window_seconds=86_400)
    limiter.record("short", short)
    limiter.record("daily", daily)
    clock.advance(1_000)
    for _ in range(1_000):
        limiter.check("other", short)
    assert "short" not in limiter._events
    assert "daily" in limiter._events
    assert limiter.check("daily", daily).allowed
