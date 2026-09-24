"""`python -m app.seed [--force]` (run from `backend/`): load `content.json` into `DATABASE_URL`.

It refuses a database that already holds content: once the admin panel is in use the database is
the source of truth, and the seed would put the file's version back over every edited row.
`--force` seeds anyway (for a development database you want reset to the file).
"""

import argparse
import asyncio
import sys
from collections.abc import Sequence

from app.core.config import Settings, get_settings
from app.core.db import create_engine, create_session_factory
from app.core.log_config import configure_logging
from app.seed import has_content, load_seed_file, seed_content


class SeedRefusedError(Exception):
    """The database already holds content and `--force` was not given."""


async def run(settings: Settings, *, force: bool = False) -> dict[str, int]:
    engine = create_engine(settings.DATABASE_URL.get_secret_value())
    try:
        async with create_session_factory(engine)() as session:
            if not force and await has_content(session):
                raise SeedRefusedError(
                    "The database already holds content, which the admin panel may have edited; "
                    "seeding would overwrite those rows with content.json. "
                    "Pass --force to seed anyway."
                )
            return await seed_content(session, load_seed_file())
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.seed", description="Load app/seed/content.json into DATABASE_URL."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="seed a database that already holds content (the file's rows overwrite edited ones)",
    )
    args = parser.parse_args(argv)
    configure_logging()
    try:
        counts = asyncio.run(run(get_settings(), force=args.force))
    except SeedRefusedError as exc:
        print(exc, file=sys.stderr)
        return 1
    for table, count in counts.items():
        print(f"{table}: {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
