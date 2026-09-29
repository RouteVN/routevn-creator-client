#!/usr/bin/env python3
"""Generate Xcode's Info.plist input without changing the source plist."""

import os
from pathlib import Path
import plistlib
import re
import sys
from urllib.parse import urlsplit


def production_dsn(path):
    values = []
    for line in path.read_text().splitlines():
        match = re.fullmatch(r"\s*ROUTEVN_SENTRY_DSN\s*=\s*(.*?)\s*", line)
        if match:
            value = match[1]
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values.append(value)
    if len(values) != 1 or not values[0]:
        raise ValueError("Set ROUTEVN_SENTRY_DSN exactly once in .env.production")
    return values[0]


def validate_dsn(dsn, release):
    url = urlsplit(dsn)
    schemes = ("https",) if release else ("http", "https")
    if (
        url.scheme not in schemes
        or not url.hostname
        or not url.username
        or not re.fullmatch(r"[0-9]+", url.path.rsplit("/", 1)[-1])
        or url.query
        or url.fragment
        or any(character.isspace() for character in dsn)
    ):
        raise ValueError("Invalid ROUTEVN_SENTRY_DSN (Release requires an HTTPS Sentry DSN)")
    # Accessing port also validates its numeric value and range.
    if url.port == 0:
        raise ValueError("Invalid ROUTEVN_SENTRY_DSN port")


def main():
    source_root = Path(os.environ["SRCROOT"])
    configuration = os.environ["CONFIGURATION"]
    if configuration not in ("Debug", "Release"):
        raise ValueError("Unsupported crash-reporting build configuration")
    release = configuration == "Release"
    dsn = (
        production_dsn(source_root / "../../.env.production")
        if release
        else os.environ.get("ROUTEVN_SENTRY_DSN", "")
    )
    if dsn:
        validate_dsn(dsn, release)

    with (source_root / "routevn/Info.plist").open("rb") as source:
        info = plistlib.load(source)
    info["RouteVNSentryDSN"] = dsn
    info["RouteVNSentryEnvironment"] = "production" if release else "development"
    output = Path(os.environ["SCRIPT_OUTPUT_FILE_0"])
    output.parent.mkdir(parents=True, exist_ok=True)
    content = plistlib.dumps(info, sort_keys=False)
    if not output.exists() or output.read_bytes() != content:
        output.write_bytes(content)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print(f"error: iOS crash-reporting configuration: {error}", file=sys.stderr)
        sys.exit(1)
