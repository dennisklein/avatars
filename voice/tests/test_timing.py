# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""Word alignment, visemes and the loudness envelope from phoneme timings."""

import math
import unittest

import avatar_voice as av
from engines import Timing

from .support import HAS_NUMPY, even_timings


def no_phonemizer(word):
    raise AssertionError(f"{word} is not in the test lexicon")


def line(text, lexicon):
    """Items and engine-like timings (0.1 s per phoneme character) for a text."""
    items = av.tokenize(text, lexicon, no_phonemizer)
    return items, even_timings(av.join_phonemes(items))


class AlignWordsTest(unittest.TestCase):
    def test_words_span_their_phonemes(self):
        # "hˈaɪ, ðˈɛɹ." : h0 ˈ1 a2 ɪ3 ,4 _5 ð6 ˈ7 ɛ8 ɹ9 .10
        items, timings = line("Hi, there.", {"hi": "hˈaɪ", "there": "ðˈɛɹ"})
        self.assertEqual(av.align_words(items, timings), [
            {"text": "Hi,", "start": 0.0, "end": 0.4},
            {"text": "there.", "start": 0.6, "end": 1.0},
        ])

    def test_spaces_inside_a_lexicon_entry_belong_to_the_word(self):
        # "kjˈuːb kəntɹˌoʊl ɡˈoʊ" : the first space is inside the first word.
        items, timings = line("kubectl go", {"kubectl": "kjˈuːb kəntɹˌoʊl", "go": "ɡˈoʊ"})
        self.assertEqual(av.align_words(items, timings), [
            {"text": "kubectl", "start": 0.0, "end": 1.6},
            {"text": "go", "start": 1.7, "end": 2.1},
        ])

    def test_dropped_phonemes_end_the_words_at_the_stream(self):
        # The engine left out the last word's phonemes: it starts and ends where the stream ends.
        items, timings = line("a b", {"a": "ɐ", "b": "bˈiː"})
        words = av.align_words(items, timings[:1])
        self.assertEqual(words, [{"text": "a", "start": 0.0, "end": 0.1}, {"text": "b", "start": 0.1, "end": 0.1}])

    def test_times_are_rounded_to_milliseconds(self):
        items = av.tokenize("go", {"go": "ɡoʊ"}, no_phonemizer)
        timings = [Timing(p, 0.1234567 * i, 0.1234567 * (i + 1)) for i, p in enumerate("ɡoʊ")]
        self.assertEqual(av.align_words(items, timings), [{"text": "go", "start": 0.0, "end": 0.37}])


class VisemesTest(unittest.TestCase):
    def test_stress_gaps_pauses_and_weights(self):
        _items, timings = line("Hi, there.", {"hi": "hˈaɪ", "there": "ðˈɛɹ"})
        self.assertEqual(av.visemes_from(timings), [
            [0.0, 0.1, "cdg", 1.0],
            [0.1, 0.3, "aa", 1.0],   # the stress mark's time goes to the stressed vowel
            [0.3, 0.4, "ih", 0.8],   # unstressed vowel
            [0.4, 0.55, "sil", 1.0],  # the word gap is split between neighbours
            [0.55, 0.7, "th", 1.0],
            [0.7, 0.9, "ee", 1.0],
            [0.9, 1.0, "r", 1.0],
            [1.0, 1.1, "sil", 1.0],
        ])

    def test_length_marks_extend_and_schwas_weigh_less(self):
        timings = even_timings("sˈɜːmə")
        self.assertEqual(av.visemes_from(timings), [
            [0.0, 0.1, "sz", 1.0],
            [0.1, 0.4, "ah", 1.0],
            [0.4, 0.5, "mbp", 1.0],
            [0.5, 0.6, "ah", 0.6],
        ])

    def test_kokoro_diphthong_letters_and_unknown_symbols(self):
        timings = even_timings("AOq")
        self.assertEqual(av.visemes_from(timings), [
            [0.0, 0.1, "aa", 0.8],
            [0.1, 0.2, "oh", 0.8],
            [0.2, 0.3, "cdg", 1.0],
        ])

    def test_empty_spans_are_dropped(self):
        timings = [Timing("m", 0.0, 0.1), Timing("a", 0.1, 0.1), Timing("p", 0.1, 0.2)]
        self.assertEqual(av.visemes_from(timings), [[0.0, 0.1, "mbp", 1.0], [0.1, 0.2, "mbp", 1.0]])

    def test_every_viseme_is_in_the_runtime_vocabulary(self):
        vocabulary = "sil mbp aa ah ee ih oh ou fv th cdg sz ch l r w".split()
        self.assertLessEqual(set(av.VISEME_OF.values()), set(vocabulary))


@unittest.skipUnless(HAS_NUMPY, "needs numpy")
class EnvelopeTest(unittest.TestCase):
    def test_frames_and_normalization(self):
        import numpy as np

        # 200 Hz: every 10 ms frame holds two whole periods, so loud frames are equal.
        sr = 24000
        loud = np.array([0.5 * math.sin(2 * math.pi * 200 * i / sr) for i in range(sr // 2)], dtype=np.float32)
        audio = np.concatenate([np.zeros(sr // 10, dtype=np.float32), loud, loud * 0.25])
        values = av.envelope(audio, sr)
        hop = sr // av.ENVELOPE_FPS
        self.assertEqual(len(values), len(audio) // hop + 1)
        self.assertEqual(values[:10], [0.0] * 10)  # the leading silence
        self.assertAlmostEqual(values[30], 1.0, places=2)  # the loud part is the reference
        self.assertAlmostEqual(values[70], 0.25, places=2)
        self.assertTrue(all(0 <= v <= 1.2 for v in values))

    def test_silence(self):
        import numpy as np

        self.assertEqual(av.envelope(np.zeros(480, dtype=np.float32), 24000), [0.0, 0.0, 0.0])
