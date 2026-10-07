# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""Speech engines of the voice tool.

An engine only turns the phonemes of a line into audio and says when each
phoneme is spoken. Everything else (lexicons, words, visemes, loudness,
pitch, files and cache keys) is the tool's, so every engine produces the
same line JSON. An engine is a module (or any object) with:

    VERSION         str, part of every cache key: change it whenever the same
                    input gives different audio or timings
    PHONEMIZER      what the `phonemes` command names as the source of words
                    that no lexicon has ("espeak")
    STOCK           stock voice names that `samples` auditions
    stock(name)     the preset of a stock voice name, or None
    setup(cache)    download and prepare the model in the cache directory
    load(cache, preset) -> a speaker with
        phonemize(word) -> str    phonemes of one word in the preset's language
        synth(phonemes) -> (audio, sample_rate, timings)
                        audio: mono float32 numpy array
                        timings: [Timing], one per phoneme character in order,
                        start and end in seconds from the start of the audio

Phonemes are espeak-style IPA, the alphabet lexicons are written in; the
phoneme string joins words with spaces and keeps the pause marks (. , ! ? ; :
… —) after the word they follow.

Engine modules import numpy and their model libraries inside functions, so
`keys` and the unit tests run without them. Failures raise EngineError.
"""

import importlib
from collections import namedtuple

DEFAULT = "kokoro"
NAMES = ("kokoro",)

Timing = namedtuple("Timing", "phoneme start end")


class EngineError(Exception):
    """A failure the tool reports as `avatar_voice: <message>`."""


_loaded = {}


def register(name, engine):
    """Add an engine under a name presets can give as "engine" (tests use a fake one)."""
    _loaded[name] = engine


def get(name):
    if name not in _loaded:
        if name not in NAMES:
            known = ", ".join(sorted(set(NAMES) | set(_loaded)))
            raise EngineError(f'unknown engine "{name}" (engines: {known})')
        _loaded[name] = importlib.import_module(f".{name}", __name__)
    return _loaded[name]


def names():
    """Every engine a preset can name: the built-in ones, then registered ones."""
    return list(NAMES) + [n for n in _loaded if n not in NAMES]
