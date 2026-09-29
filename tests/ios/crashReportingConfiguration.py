"""Run with python3 tests/ios/crashReportingConfiguration.py."""

import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/configure-ios-crash-reporting.py"
PRODUCTION_DSN = "https://public-key@collector.example/1"
DEBUG_DSN = "http://public-key@127.0.0.1:3000/1"


class CrashReportingConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "ios/routevn"
        self.source.joinpath("routevn").mkdir(parents=True)
        self.source.joinpath("routevn/Info.plist").write_bytes(
            plistlib.dumps({"CFBundleVersion": "$(CURRENT_PROJECT_VERSION)"})
        )
        self.output = self.root / "Derived Files/RouteVN-Info.plist"
        self.env_file = self.root / ".env.production"

    def run_build(self, configuration, dsn="", success=True):
        environment = dict(os.environ)
        environment.update(
            SRCROOT=str(self.source),
            CONFIGURATION=configuration,
            SCRIPT_OUTPUT_FILE_0=str(self.output),
            ROUTEVN_SENTRY_DSN=dsn,
        )
        result = subprocess.run(
            ["/usr/bin/python3", str(SCRIPT)], env=environment,
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode == 0, success, result.stderr)
        if success:
            return plistlib.loads(self.output.read_bytes())
        self.assertIn("error: iOS crash-reporting configuration:", result.stderr)

    def test_release_reads_production_file_and_ignores_override(self):
        for quote in ("", '"', "'"):
            self.env_file.write_text(f"ROUTEVN_SENTRY_DSN={quote}{PRODUCTION_DSN}{quote}\n")
            info = self.run_build("Release", DEBUG_DSN)
            self.assertEqual(info["RouteVNSentryDSN"], PRODUCTION_DSN)
            self.assertEqual(info["RouteVNSentryEnvironment"], "production")
            self.assertEqual(info["CFBundleVersion"], "$(CURRENT_PROJECT_VERSION)")

    def test_release_rejects_missing_empty_duplicate_and_invalid_values(self):
        self.run_build("Release", success=False)
        for contents in (
            "OTHER_KEY=value\n", "ROUTEVN_SENTRY_DSN=\n",
            'ROUTEVN_SENTRY_DSN=""\n',
            f"ROUTEVN_SENTRY_DSN={PRODUCTION_DSN}\n" * 2,
            *[f"ROUTEVN_SENTRY_DSN={dsn}\n" for dsn in (
                DEBUG_DSN, "https://collector.example/1", "https://key@/1",
                "https://key@collector.example/", "https://key@collector.example:bad/1",
                "https://key@collector.example/1?query=value", "not-a-url",
            )],
        ):
            with self.subTest(contents=contents):
                self.env_file.write_text(contents)
                self.run_build("Release", success=False)

    def test_debug_without_production_file_disables_reporting(self):
        info = self.run_build("Debug")
        self.assertEqual(info["RouteVNSentryDSN"], "")
        self.assertEqual(info["RouteVNSentryEnvironment"], "development")

    def test_debug_does_not_read_production_dsn(self):
        self.env_file.write_text(f"ROUTEVN_SENTRY_DSN={PRODUCTION_DSN}\n")
        self.assertEqual(self.run_build("Debug")["RouteVNSentryDSN"], "")

    def test_debug_override_can_be_removed_on_incremental_build(self):
        self.assertEqual(self.run_build("Debug", DEBUG_DSN)["RouteVNSentryDSN"], DEBUG_DSN)
        self.assertEqual(self.run_build("Debug")["RouteVNSentryDSN"], "")
        self.run_build("Debug", "invalid", success=False)

    def test_release_revalidates_file_after_successful_build(self):
        self.env_file.write_text(f"ROUTEVN_SENTRY_DSN={PRODUCTION_DSN}\n")
        self.run_build("Release")
        self.env_file.write_text("ROUTEVN_SENTRY_DSN=\n")
        self.run_build("Release", success=False)


if __name__ == "__main__":
    unittest.main()
