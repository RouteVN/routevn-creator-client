"""Exercise the actual Gradle DSN validation in a disposable project copy.

Run with JAVA_HOME and ANDROID_HOME configured, using Python 3.
"""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
DSN = "https://public-key@collector.example/1"


class CrashReportingConfigurationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="routevn-android-dsn-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        cls.project = cls.root / "android/routevn"
        shutil.copytree(
            ROOT / "android/routevn", cls.project,
            ignore=shutil.ignore_patterns("build", ".gradle", "local.properties", "assets", "jniLibs"),
        )

    def build_config(self, contents, success, debug_dsn=""):
        env_file = self.root / ".env.production"
        if contents is None:
            env_file.unlink(missing_ok=True)
        else:
            env_file.write_text(contents)
        result = subprocess.run(
            [str(self.project / "gradlew"), "--console=plain", ":app:generateReleaseBuildConfig",
             f"-ProutevnSentryDsn={debug_dsn}"],
            cwd=self.project, env=os.environ, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        if not success:
            self.assertNotIn("Script compilation errors", result.stderr)
            self.assertTrue(any(message in result.stderr for message in (
                "Invalid ROUTEVN_SENTRY_DSN", "Set ROUTEVN_SENTRY_DSN exactly once",
                ".env.production (No such file or directory)",
            )), result.stderr)
        if success:
            generated = self.project / "app/build/generated/source/buildConfig/release/com/routevn/creator/BuildConfig.java"
            self.assertIn(f'SENTRY_DSN = "{DSN}"', generated.read_text())

    def test_valid_release_and_debug_collector(self):
        self.build_config(f'ROUTEVN_SENTRY_DSN="{DSN}"\n', True,
                          "http://public-key@127.0.0.1:3000/1")

    def test_reject_invalid_release_configuration(self):
        for value in ("", "not-a-dsn", "http://key@collector.example/1",
                      "https://collector.example/1", "https://key@/1",
                      "https://key@collector.example/", "https://key@collector.example:0/1",
                      "https://key@collector.example:65536/1", "https://key@collector.example/1?x=y"):
            with self.subTest(value=value):
                self.build_config(f"ROUTEVN_SENTRY_DSN={value}\n", False)

    def test_reject_missing_and_duplicate_configuration(self):
        for contents in (None, "OTHER=value\n", f"ROUTEVN_SENTRY_DSN={DSN}\n" * 2):
            with self.subTest(contents=contents):
                self.build_config(contents, False)

    def test_reject_invalid_debug_override(self):
        self.build_config(f"ROUTEVN_SENTRY_DSN={DSN}\n", False, "not-a-dsn")


if __name__ == "__main__":
    unittest.main()
