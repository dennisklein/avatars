# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""The engine registry and the parts of the Kokoro engine that need no model."""

import unittest

import engines
from engines import EngineError

from .support import HAS_NUMPY, FakeEngine, tempdir


class RegistryTest(unittest.TestCase):
    def test_builtin_engines_have_the_interface(self):
        for name in engines.NAMES:
            with self.subTest(engine=name):
                engine = engines.get(name)
                self.assertIs(engines.get(name), engine)
                self.assertIsInstance(engine.VERSION, str)
                self.assertIsInstance(engine.PHONEMIZER, str)
                for fn in ("stock", "setup", "load"):
                    self.assertTrue(callable(getattr(engine, fn)), fn)
                for voice in engine.STOCK:
                    self.assertEqual(engine.stock(voice)["engine"], name)

    def test_register_and_unknown_names(self):
        fake = FakeEngine()
        engines.register("fake", fake)
        self.addCleanup(engines._loaded.pop, "fake", None)
        self.assertIs(engines.get("fake"), fake)
        self.assertEqual(engines.names()[: len(engines.NAMES)], list(engines.NAMES))
        self.assertIn("fake", engines.names())
        with self.assertRaisesRegex(EngineError, 'unknown engine "nope"'):
            engines.get("nope")


class FakeKokoro:
    """What Speaker uses of kokoro_onnx.Kokoro: voice styles and the tokenizer."""

    def __init__(self, styles=None):
        self.styles = styles or {}

    def get_voice_style(self, name):
        return self.styles[name]


class KokoroTest(unittest.TestCase):
    def setUp(self):
        self.kokoro = engines.get("kokoro")

    def test_stock_voices(self):
        self.assertEqual(
            self.kokoro.stock("af_heart"),
            {"engine": "kokoro", "mix": {"af_heart": 1.0}, "speed": 1.0, "lang": "en-us"},
        )
        self.assertIsNone(self.kokoro.stock("sindy"))
        self.assertLessEqual(set(self.kokoro.STOCK), set(self.kokoro.STOCK_VOICES))

    def test_load_without_the_model(self):
        with self.assertRaisesRegex(EngineError, "model missing"):
            self.kokoro.load(tempdir(self), {"mix": {"af_heart": 1.0}})

    def test_bad_mixes(self):
        for mix, message in [
            ({}, "needs \"mix\""),
            (["af_heart"], "needs \"mix\""),
            ({"af_heart": "1"}, "needs \"mix\""),
            ({"af_nobody": 1.0}, "unknown Kokoro voice af_nobody"),
            ({"af_heart": 0, "af_bella": 0}, "more than 0"),
        ]:
            with self.subTest(mix=mix), self.assertRaisesRegex(EngineError, message):
                self.kokoro.Speaker(FakeKokoro(), {"mix": mix})

    def test_no_mix_phonemizes_but_does_not_speak(self):
        speaker = self.kokoro.Speaker(FakeKokoro(), {"engine": "kokoro"})
        self.assertEqual((speaker.lang, speaker.speed), ("en-us", 1.0))
        with self.assertRaisesRegex(EngineError, "no \"mix\""):
            speaker.synth("hˈaɪ")

    @unittest.skipUnless(HAS_NUMPY, "needs numpy")
    def test_mix_weights_are_normalized(self):
        import numpy as np

        k = FakeKokoro({"af_heart": np.full(4, 1.0), "af_bella": np.full(4, 3.0)})
        style = self.kokoro.Speaker(k, {"mix": {"af_heart": 3, "af_bella": 1}}).style
        self.assertEqual(style.dtype, np.float32)
        self.assertEqual(style.tolist(), [1.5] * 4)
