"""`python -m app.seed` (run from `backend/`): upsert `content.json` into `DATABASE_URL`."""

import asyncio

from app.core.config import Settings, get_settings
from app.core.db import create_engine, create_session_factory
from app.core.log_config import configure_logging
from app.seed import load_seed_file, seed_content


async def run(settings: Settings) -> dict[str, int]:
    engine = create_engine(settings.DATABASE_URL.get_secret_value())
    try:
        async with create_session_factory(engine)() as session:
            return await seed_content(session, load_seed_file())
    finally:
        await engine.dispose()


def main() -> None:
    configure_logging()
    counts = asyncio.run(run(get_settings()))
    for table, count in counts.items():
        print(f"{table}: {count}")


if __name__ == "__main__":
    main()
