"""Process logging setup.

Uvicorn configures its own `uvicorn.*` loggers only, so application loggers (`app.*`) need a
root handler for INFO messages such as the console email provider's output to be visible.
`basicConfig` is a no-op when the root logger already has handlers (e.g. under pytest).
"""

import logging

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_logging(level: int = logging.INFO) -> None:
    logging.basicConfig(level=level, format=LOG_FORMAT)
