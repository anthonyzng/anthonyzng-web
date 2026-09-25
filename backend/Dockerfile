# syntax=docker/dockerfile:1
# Backend image: FastAPI under uvicorn, one worker (the rate limiter lives in the process).
# The same image runs the one-off `migrate` service (`alembic upgrade head`) and the seed CLI.
# Configuration comes from the environment only: `.env` files are never copied in.

ARG PYTHON_VERSION=3.13

# --- dependencies ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /app
# Runtime dependencies only (no dev group), exactly as locked; cached until the lock changes.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    uv sync --frozen --no-dev --no-install-project

# --- runtime --------------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS runtime
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY --chown=root:root alembic.ini ./
COPY --chown=root:root alembic ./alembic
COPY --chown=root:root app ./app
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4)"]
# One worker (in-process rate limiter); no access log (it would record raw client IPs, which the
# app never writes; the client IP comes from X-Forwarded-For only with TRUSTED_PROXY=true). At most
# 64 requests in flight: beyond that uvicorn answers 503 at once instead of queueing without bound.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--no-access-log", "--no-server-header", "--limit-concurrency", "64"]
