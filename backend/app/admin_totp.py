"""`python -m app.admin_totp status|reset`: the admin's two-factor sign-in from a shell.

The way back in when the authenticator is lost (or `TOTP_ENCRYPTION_KEY` changed): on the VM,

    cd /opt/anthonyzng-web && docker compose run --rm backend python -m app.admin_totp reset

turns two-factor sign-in off and revokes every session; sign in with the password and set it up
again in the admin panel. `status` only reports whether it is on.
"""

import argparse
import asyncio
import sys
from collections.abc import Sequence

from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.db import create_engine, create_session_factory
from app.core.log_config import configure_logging
from app.models.admin_user import AdminUser
from app.services.auth import normalize_email
from app.services.totp import clear


async def run(settings: Settings, command: str) -> str:
    engine = create_engine(settings.DATABASE_URL.get_secret_value())
    try:
        async with create_session_factory(engine)() as session:
            user = await session.scalar(
                select(AdminUser)
                .where(AdminUser.email == normalize_email(settings.ADMIN_EMAIL))
                .with_for_update()
            )
            if user is None:
                return "No admin account yet (the backend creates it on start)."
            enabled = user.totp_secret is not None
            if command == "status":
                if not enabled:
                    return "Two-factor sign-in is off."
                return (
                    f"Two-factor sign-in is on (since {user.totp_enabled_at:%Y-%m-%d %H:%M} UTC)."
                )
            clear(user)
            await session.commit()
            if enabled:
                return "Two-factor sign-in turned off; every session revoked. Set it up again."
            return "Two-factor sign-in was already off; every session revoked."
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.admin_totp",
        description="Show or reset the admin's two-factor sign-in.",
    )
    parser.add_argument(
        "command",
        choices=["status", "reset"],
        help="status: report it; reset: turn it off and revoke every session",
    )
    args = parser.parse_args(argv)
    configure_logging()
    print(asyncio.run(run(get_settings(), args.command)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
