# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""Shared test helpers: a fake phonemizer, synthetic timings and a fake engine."""

import importlib.util
import json
import math
import tempfile
from pathlib import Path

from engines import Timing

VOICE = Path(__file__).resolve().parents[1]
REPO = VOICE.parent
HAS_NUMPY = importlib.util.find_spec("numpy") is not None


def fake_phonemize(word):
    """Deterministic stand-in for espeak: the lowercase letters, stressed first."""
    return "ˈ" + "".join(c for c in word.lower() if c.isalpha())


def even_timings(phonemes, step=0.1, start=0.0):
    """One Timing per phoneme character, `step` seconds each, as an engine reports them."""
    return [Timing(p, start + i * step, start + (i + 1) * step) for i, p in enumerate(phonemes)]


def tempdir(test):
    """A temporary directory removed when the test ends."""
    tmp = tempfile.TemporaryDirectory()
    test.addCleanup(tmp.cleanup)
    return Path(tmp.name)


def write_json(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return str(path)


class FakeEngine:
    """An engine without a model: a tone per phoneme, 50 ms each."""

    VERSION = "fake/1"
    PHONEMIZER = "fake"
    STOCK = ("fake_stock",)

    def __init__(self):
        self.calls = []

    def stock(self, name):
        return {"engine": "fake", "mix": {name: 1.0}} if name in self.STOCK else None

    def setup(self, cache):
        pass

    def load(self, cache, preset):
        return FakeSpeaker(self, preset)


class FakeSpeaker:
    def __init__(self, engine, preset):
        self.engine = engine
        self.preset = preset

    def phonemize(self, word):
        return fake_phonemize(word)

    def synth(self, phonemes):
        import numpy as np

        self.engine.calls.append(phonemes)
        sr, step = 24000, 0.05
        n = int(len(phonemes) * step * sr)
        audio = np.array([0.5 * math.sin(i * 0.05) for i in range(n)], dtype=np.float32)
        return audio, sr, even_timings(phonemes, step)
