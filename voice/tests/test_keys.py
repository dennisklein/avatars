# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""Cache keys: what re-voices a line and what does not."""

import json
import subprocess
import sys
import unittest

import avatar_voice as av
import engines

from .support import VOICE, FakeEngine, tempdir, write_json

LINES = [
    {"id": "run", "text": "Run kubectl now."},
    {"id": "hello", "text": "Hello, world!"},
    {"id": "data", "text": "Then JSON shows it."},
    {"id": "both", "text": "kubectl, then json."},
]
LEXICON = {"kubectl": "kjˈuːb kəntɹˌoʊl", "json": "dʒˈeɪsən", "a": "ɐ"}
PRESET = {"engine": "kokoro", "mix": {"af_heart": 1.0}, "speed": 1.0}


def keys(lexicon=LEXICON, preset=PRESET, name="host", lines=LINES):
    spec = {"lines": lines}
    return av.script_keys(spec, name, preset, lexicon)


class KeysTest(unittest.TestCase):
    def test_keys_are_12_hex_chars_and_stable(self):
        a = keys()
        self.assertEqual(list(a), ["run", "hello", "data", "both"])
        for k in a.values():
            self.assertRegex(k, r"^[0-9a-f]{12}$")
        self.assertEqual(a, keys(dict(reversed(list(LEXICON.items())))))
        self.assertEqual(a, keys(preset=dict(reversed(list(PRESET.items())))))

    def test_an_unrelated_lexicon_change_keeps_every_key(self):
        a = keys()
        self.assertEqual(a, keys(dict(LEXICON, github="ɡˈɪthʌb")))
        self.assertEqual(a, keys({k: v for k, v in LEXICON.items() if k != "a"}))
        # A later lexicon that repeats an entry with the same phonemes changes nothing either.
        self.assertEqual(a, keys(dict(LEXICON, kubectl="kjˈuːb kəntɹˌoʊl")))

    def test_a_used_word_changes_only_its_lines(self):
        a = keys()
        b = keys(dict(LEXICON, kubectl="kˈuːbsɪtˌiːˈɛl"))
        self.assertEqual([i for i in a if a[i] != b[i]], ["run", "both"])
        c = keys(dict(LEXICON, json="dʒˈeɪsɑːn"))
        self.assertEqual([i for i in a if a[i] != c[i]], ["data", "both"])

    def test_adding_a_word_a_line_uses_changes_that_line(self):
        a = keys()
        b = keys(dict(LEXICON, hello="hɛlˈoʊ"))
        self.assertEqual([i for i in a if a[i] != b[i]], ["hello"])

    def test_text_preset_and_name_change_keys(self):
        a = keys()
        self.assertNotEqual(a["hello"], keys(lines=[{"id": "hello", "text": "Hello world!"}])["hello"])
        self.assertTrue(all(a[i] != k for i, k in keys(preset=dict(PRESET, speed=1.1)).items()))
        self.assertTrue(all(a[i] != k for i, k in keys(name="other").items()))

    def test_lead_changes_only_its_line(self):
        a = keys()
        lines = [dict(line, lead=0.5) if line["id"] == "hello" else line for line in LINES]
        b = keys(lines=lines)
        self.assertEqual([i for i in a if a[i] != b[i]], ["hello"])
        # No lead and a lead of 0 sound the same.
        self.assertEqual(a, keys(lines=[dict(line, lead=0) for line in LINES]))

    def test_the_tool_and_engine_versions_are_part_of_the_key(self):
        fake = FakeEngine()
        engines.register("fake", fake)
        self.addCleanup(engines._loaded.pop, "fake", None)
        preset = {"engine": "fake", "mix": {"fake_stock": 1.0}}
        a = keys(preset=preset)
        fake.VERSION = "fake/2"
        self.assertTrue(all(a[i] != k for i, k in keys(preset=preset).items()))
        fake.VERSION = FakeEngine.VERSION
        self.assertEqual(a, keys(preset=preset))
        old = av.FORMAT
        av.FORMAT = "avatar-voice/test"
        self.addCleanup(setattr, av, "FORMAT", old)
        self.assertTrue(all(a[i] != k for i, k in keys(preset=preset).items()))


class KeysCommandTest(unittest.TestCase):
    def test_runs_without_numpy_onnx_or_kokoro(self):
        d = tempdir(self)
        script = write_json(d / "script.json", {"voice": "calm", "lines": LINES})
        voices = write_json(d / "voice.json", {"default": "calm", "presets": {"calm": PRESET}})
        lexicon = write_json(d / "lexicon.json", {"words": LEXICON})
        # Importing a module that is None in sys.modules fails, as if it were not installed.
        code = (
            "import runpy, sys\n"
            "for m in ('numpy', 'onnx', 'onnxruntime', 'kokoro_onnx'): sys.modules[m] = None\n"
            # As when the tool runs as a script: its directory first on the path.
            f"sys.path.insert(0, {str(VOICE)!r})\n"
            "sys.argv = ['avatar_voice.py'] + sys.argv[1:]\n"
            f"runpy.run_path({str(VOICE / 'avatar_voice.py')!r}, run_name='__main__')\n"
        )
        out = subprocess.run(
            [sys.executable, "-c", code, "keys", script, "--voices", voices, "--lexicon", lexicon],
            capture_output=True, text=True,
        )
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(json.loads(out.stdout), keys(name="calm"))
