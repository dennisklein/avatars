# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""Lexicons, voice presets, script files and the voice data of this repository."""

import argparse
import contextlib
import io
import json
import unittest
from pathlib import Path

import avatar_voice as av
import engines

from .support import REPO, tempdir, write_json


def quiet_exit(test, fn, *args):
    """Call fn, expecting avatar_voice's error exit; return its message."""
    err = io.StringIO()
    with contextlib.redirect_stderr(err), test.assertRaises(SystemExit) as cm:
        fn(*args)
    test.assertEqual(cm.exception.code, 1)
    test.assertTrue(err.getvalue().startswith("avatar_voice: "), err.getvalue())
    return err.getvalue()


class LexiconTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempdir(self)

    def lex(self, name, words, **extra):
        return write_json(self.dir / name, dict(extra, words=words))

    def test_later_files_win_and_keys_are_lowercased(self):
        core = self.lex("core.json", {"a": "ɐ", "Word": "one"}, _comment="library pack")
        avatar = self.lex("avatar.json", {"word": "two", "name": "nˈeɪm"})
        project = self.lex("project.json", {"WORD": "three"})
        self.assertEqual(av.load_lexicons([core, avatar, project]), {"a": "ɐ", "word": "three", "name": "nˈeɪm"})
        self.assertEqual(av.load_lexicons([project, avatar, core])["word"], "one")

    def test_keys_lose_surrounding_punctuation(self):
        lex = self.lex("lex.json", {"(nginx)": "ˈɛndʒɪn ˈɛks", "e.g.": "fˈɔːɹ ɪɡzˈæmpəl", "--": "dˈæʃ"})
        self.assertEqual(av.load_lexicons([lex]), {"nginx": "ˈɛndʒɪn ˈɛks", "e.g": "fˈɔːɹ ɪɡzˈæmpəl", "--": "dˈæʃ"})

    def test_no_files(self):
        self.assertEqual(av.load_lexicons([]), {})
        self.assertEqual(av.load_lexicons(None), {})

    def test_bad_files(self):
        self.assertIn("lexicon", quiet_exit(self, av.load_lexicons, [str(self.dir / "missing.json")]))
        (self.dir / "broken.json").write_text("{", encoding="utf-8")
        quiet_exit(self, av.load_lexicons, [str(self.dir / "broken.json")])
        quiet_exit(self, av.load_lexicons, [write_json(self.dir / "list.json", ["a"])])
        quiet_exit(self, av.load_lexicons, [self.lex("number.json", {"a": 1})])


class PresetTest(unittest.TestCase):
    VOICES = {
        "default": "calm",
        "presets": {
            "calm": {"mix": {"af_bella": 1.0}, "speed": 1.0},
            "fast": {"engine": "kokoro", "mix": {"af_sky": 1.0}, "speed": 1.2},
        },
    }

    def voices(self, data=None):
        return av.load_voices(write_json(tempdir(self) / "voice.json", data or self.VOICES))

    def test_presets_get_the_default_engine(self):
        self.assertEqual(av.preset_of(self.voices(), "calm"), ("calm", {"mix": {"af_bella": 1.0}, "speed": 1.0, "engine": "kokoro"}))

    def test_stock_voices_work_without_presets(self):
        self.assertEqual(
            av.preset_of(None, "af_heart"),
            ("af_heart", {"engine": "kokoro", "mix": {"af_heart": 1.0}, "speed": 1.0, "lang": "en-us"}),
        )
        self.assertEqual(av.preset_of(self.voices(), "bf_emma")[1]["mix"], {"bf_emma": 1.0})

    def test_unknown_voices(self):
        self.assertIn("calm, fast", quiet_exit(self, av.preset_of, self.voices(), "loud"))
        self.assertIn("--voices", quiet_exit(self, av.preset_of, None, "calm"))

    def test_voice_name_order(self):
        voices = self.voices()
        spec = {"voice": "fast"}
        self.assertEqual(av.voice_name(argparse.Namespace(voice="af_sky"), voices, spec), "af_sky")
        self.assertEqual(av.voice_name(argparse.Namespace(voice=None), voices, spec), "fast")
        self.assertEqual(av.voice_name(argparse.Namespace(voice=None), voices, {}), "calm")
        quiet_exit(self, av.voice_name, argparse.Namespace(voice=None), None, {})

    def test_bad_voice_files(self):
        quiet_exit(self, self.voices, {"presets": []})
        quiet_exit(self, self.voices, {"default": "nope", "presets": {"a": {}}})

    def test_unknown_engine(self):
        with self.assertRaises(engines.EngineError):
            engines.get("nope")


class ScriptFileTest(unittest.TestCase):
    def script(self, data):
        return write_json(tempdir(self) / "script.json", data)

    def test_valid(self):
        spec = av.read_script(self.script({"voice": "x", "lines": [{"id": "a", "text": "Hi."}, {"id": "b.2", "text": "Yo.", "lead": 0.5}]}))
        self.assertEqual([line["id"] for line in spec["lines"]], ["a", "b.2"])

    def test_invalid(self):
        for data in [
            {},
            {"lines": [{"id": "a"}]},
            {"lines": [{"id": "a", "text": "x"}, {"id": "a", "text": "y"}]},
            {"lines": [{"id": "../a", "text": "x"}]},
            {"lines": [{"id": "", "text": "x"}]},
            {"lines": [{"id": "..", "text": "x"}]},
            {"lines": [{"id": "a\\b", "text": "x"}]},
            {"lines": [{"id": "why?", "text": "x"}]},
            {"lines": [{"id": "a#b", "text": "x"}]},
            {"lines": [{"id": "100%", "text": "x"}]},
            {"lines": [{"id": "a", "text": "x", "lead": -1}]},
            {"lines": [{"id": "a", "text": "x", "lead": "1"}]},
        ]:
            with self.subTest(data=data):
                quiet_exit(self, av.read_script, self.script(data))


def strict_json(path):
    """Load JSON, failing on duplicate keys (a later duplicate would silently win)."""

    def pairs(items):
        keys = [k for k, _ in items]
        dup = {k for k in keys if keys.count(k) > 1}
        if dup:
            raise ValueError(f"{path}: duplicate keys {sorted(dup)}")
        return dict(items)

    return json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=pairs)


class RepositoryDataTest(unittest.TestCase):
    """The lexicon packs and the voice presets shipped in this repository."""

    def lexicons(self):
        files = sorted((REPO / "lexicons").glob("*/*.json")) + sorted((REPO / "avatars").glob("*/lexicon.json"))
        self.assertTrue(files)
        return files

    def test_lexicon_files(self):
        for f in self.lexicons():
            with self.subTest(file=str(f.relative_to(REPO))):
                data = strict_json(f)
                self.assertLessEqual(set(data), {"_comment", "words"})
                self.assertTrue(data["words"])
                for word, ph in data["words"].items():
                    self.assertEqual(word, word.lower(), "keys are lowercase")
                    self.assertEqual(word, word.strip(".,!?;:\"'()…—"), "keys carry no surrounding punctuation")
                    self.assertTrue(ph.strip(), f"{word} has no phonemes")

    def test_library_packs_do_not_overlap(self):
        owner = {}
        for f in self.lexicons():
            for word in strict_json(f)["words"]:
                with self.subTest(word=word):
                    self.assertNotIn(word, owner, f"{word} is in {owner.get(word)} and {f.name}")
                owner[word] = f.name

    def test_avatar_voices(self):
        files = sorted((REPO / "avatars").glob("*/voice.json"))
        self.assertTrue(files)
        for f in files:
            with self.subTest(file=str(f.relative_to(REPO))):
                data = strict_json(f)
                voices = av.load_voices(str(f))
                self.assertIn(data["default"], data["presets"])
                self.assertTrue(data.get("sample"))
                for name in data["presets"]:
                    _name, preset = av.preset_of(voices, name)
                    engine = engines.get(preset["engine"])
                    for voice in preset.get("mix", {}):
                        self.assertIsNotNone(engine.stock(voice), f"{name} mixes unknown voice {voice}")
