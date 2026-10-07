# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""index.json and lines.js, and whole script runs through a fake engine."""

import contextlib
import io
import json
import unittest

import avatar_voice as av
import engines

from .support import HAS_NUMPY, FakeEngine, tempdir, write_json


def read_lines_js(path):
    text = path.read_text(encoding="utf-8")
    prefix, suffix = "window.AVATAR_LINES = ", ";\n"
    assert text.startswith(prefix) and text.endswith(suffix), text[:40]
    return json.loads(text[len(prefix):-len(suffix)]), text


class WriteIndexTest(unittest.TestCase):
    def test_format(self):
        out = tempdir(self)
        metas = {
            "intro": {"text": "Hi — I'm here.", "voice": "v", "duration": 1.5, "phonemes": "hˈaɪ", "words": [], "hash": "0123456789ab"},
            "next": {"text": "Next.", "voice": "v", "duration": 0.8, "phonemes": "nˈɛkst", "words": []},
        }
        index = [{"id": i, "duration": m["duration"], "text": m["text"]} for i, m in metas.items()]
        av.write_index(out, index, metas)
        bundle, text = read_lines_js(out / "lines.js")
        # Everything but the phonemes, in line order, compact and with non-ASCII text kept.
        self.assertEqual(list(bundle), ["intro", "next"])
        self.assertEqual(bundle["intro"], {k: v for k, v in metas["intro"].items() if k != "phonemes"})
        self.assertNotIn("phonemes", text)
        self.assertIn("Hi — I'm here.", text)
        self.assertNotIn(", ", text.replace("Hi — I'm here.", ""))
        self.assertEqual(text.count("\n"), 1)
        self.assertEqual(json.loads((out / "index.json").read_text(encoding="utf-8")), index)
        self.assertIn('\n  "id": "intro"', (out / "index.json").read_text(encoding="utf-8"))
        # The phonemes stay in the line JSON the caller passed in.
        self.assertIn("phonemes", metas["intro"])


class FakeEngineCase(unittest.TestCase):
    """A project directory with presets on a fake engine, a lexicon and a script."""

    def setUp(self):
        self.engine = FakeEngine()
        engines.register("fake", self.engine)
        self.addCleanup(engines._loaded.pop, "fake", None)
        self.dir = tempdir(self)
        self.cache, av.CACHE = av.CACHE, self.dir / "cache"
        self.addCleanup(setattr, av, "CACHE", self.cache)
        self.voices = write_json(self.dir / "voice.json", {
            "default": "host",
            "presets": {"host": {"engine": "fake", "mix": {"x": 1.0}}, "other": {"engine": "fake", "mix": {"y": 1.0}}},
        })
        self.lexicon = write_json(self.dir / "lexicon.json", {"words": {"kubectl": "kjˈuːb kəntɹˌoʊl"}})
        self.script = write_json(self.dir / "script.json", {"lines": [
            {"id": "one", "text": "Run kubectl, then wait."},
            {"id": "two", "text": "Done!", "lead": 0.25},
        ]})
        self.out = self.dir / "out"

    def run_cli(self, *argv):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            av.main(list(argv))
        return stdout.getvalue()

    def voice(self, *extra):
        return self.run_cli("script", self.script, "-o", str(self.out), "--voices", self.voices, "--lexicon", self.lexicon, *extra)


class PhonemesTest(FakeEngineCase):
    def test_rows_sources_and_flags(self):
        out = self.run_cli("phonemes", "Run kubectl, CLI", "--voices", self.voices, "--lexicon", self.lexicon)
        self.assertEqual(out.splitlines(), [
            "Run                  ˈrun                         fake",
            "kubectl              kjˈuːb kəntɹˌoʊl             lexicon",
            "CLI                  ˈcli                         fake     acronym",
        ])
        flagged = self.run_cli("phonemes", "-s", self.script, "--voices", self.voices, "--flagged")
        self.assertEqual(flagged, "")
        self.assertEqual(self.engine.calls, [])


@unittest.skipUnless(HAS_NUMPY, "needs numpy")
class ScriptRunTest(FakeEngineCase):
    def test_files_timings_and_hashes(self):
        self.voice()
        self.assertEqual(self.engine.calls, ["ˈrun kjˈuːb kəntɹˌoʊl, ˈthen ˈwait.", "ˈdone!"])
        keys = json.loads(self.run_cli("keys", self.script, "--voices", self.voices, "--lexicon", self.lexicon))
        for lid in ("one", "two"):
            meta = json.loads((self.out / f"{lid}.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["hash"], keys[lid])
            self.assertEqual(meta["voice"], "host")
            self.assertEqual(meta["sampleRate"], 24000)
            self.assertTrue((self.out / f"{lid}.wav").stat().st_size > 44)
            self.assertEqual(list(meta), ["text", "voice", "duration", "sampleRate", "phonemes", "words", "visemes", "envelope", "hash"])
        one = json.loads((self.out / "one.json").read_text(encoding="utf-8"))
        self.assertEqual([w["text"] for w in one["words"]], ["Run", "kubectl,", "then", "wait."])
        # 0.05 s per phoneme character; "kubectl" starts after "ˈrun " and spans 16 of them.
        self.assertEqual(one["words"][1], {"text": "kubectl,", "start": 0.25, "end": 1.05})
        # The tail of silence after the speech, and one envelope value per 10 ms.
        self.assertEqual(one["duration"], round(len(self.engine.calls[0]) * 0.05 + 0.15, 3))
        self.assertEqual(len(one["envelope"]["values"]), int(one["duration"] * 24000) // 240 + 1)
        two = json.loads((self.out / "two.json").read_text(encoding="utf-8"))
        # The lead shifts every timing and lengthens the audio.
        self.assertEqual(two["words"][0]["start"], 0.25)
        self.assertEqual(two["duration"], round(0.25 + len("ˈdone!") * 0.05 + 0.15, 3))
        bundle, _ = read_lines_js(self.out / "lines.js")
        self.assertEqual(set(bundle), {"one", "two"})
        self.assertEqual(bundle["one"], {k: v for k, v in one.items() if k != "phonemes"})
        index = json.loads((self.out / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(index, [
            {"id": "one", "duration": one["duration"], "text": "Run kubectl, then wait."},
            {"id": "two", "duration": two["duration"], "text": "Done!"},
        ])

    def test_cache_reuse_force_and_lexicon_changes(self):
        self.voice()
        first = (self.out / "lines.js").read_bytes()
        self.engine.calls.clear()
        self.voice()
        self.assertEqual(self.engine.calls, [])
        self.assertEqual((self.out / "lines.js").read_bytes(), first)
        self.voice("--force")
        self.assertEqual(len(self.engine.calls), 2)
        # A word no line uses re-voices nothing; changing a used word re-voices its line only.
        self.engine.calls.clear()
        write_json(self.lexicon, {"words": {"kubectl": "kjˈuːb kəntɹˌoʊl", "github": "ɡˈɪthʌb"}})
        self.voice()
        self.assertEqual(self.engine.calls, [])
        write_json(self.lexicon, {"words": {"kubectl": "kˈuːbsɪtˌiːˈɛl"}})
        self.voice()
        self.assertEqual(self.engine.calls, ["ˈrun kˈuːbsɪtˌiːˈɛl, ˈthen ˈwait."])
        # A missing WAV is voiced again.
        self.engine.calls.clear()
        (self.out / "two.wav").unlink()
        self.voice()
        self.assertEqual(self.engine.calls, ["ˈdone!"])

    def test_voice_option_and_say(self):
        self.voice("-v", "other")
        self.assertEqual(json.loads((self.out / "one.json").read_text(encoding="utf-8"))["voice"], "other")
        base = self.dir / "say" / "take.v2"
        out = self.run_cli("say", "Hi there.", "-o", str(base), "--voices", self.voices, "--lead", "0.5")
        self.assertIn("2 words", out)
        meta = json.loads((self.dir / "say" / "take.v2.json").read_text(encoding="utf-8"))
        self.assertTrue((self.dir / "say" / "take.v2.wav").exists())
        self.assertNotIn("hash", meta)
        self.assertEqual(meta["words"][0]["start"], 0.5)

    def test_samples(self):
        out = self.run_cli("samples", "-o", str(self.dir / "samples"), "--voices", self.voices, "--text", "Hello.")
        self.assertEqual([line.split()[0] for line in out.splitlines()], ["host", "other", "fake_stock"])
        self.assertTrue((self.dir / "samples" / "fake_stock.wav").exists())
