# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""Splitting lines into words and pauses, phonemes and pronunciation flags."""

import unittest

import avatar_voice as av

from .support import fake_phonemize


class SplitTest(unittest.TestCase):
    def test_words_keep_their_display_text(self):
        items = av.split('Hi, I\'m "Sindy"! (really)')
        words = [(it["text"], it["display"]) for it in items if "text" in it]
        self.assertEqual(words, [("Hi", "Hi,"), ("I'm", "I'm"), ("Sindy", '"Sindy"!'), ("really", "(really)")])

    def test_trailing_punctuation_becomes_pauses_in_order(self):
        items = av.split("Wait… what?! Done; next: go — now.")
        self.assertEqual(
            [it.get("pause") or it["text"] for it in items],
            ["Wait", "…", "what", "?", "!", "Done", ";", "next", ":", "go", "—", "now", "."],
        )

    def test_closing_brackets_and_quotes_are_no_pauses(self):
        items = av.split('(see "this")')
        self.assertEqual([it for it in items if "pause" in it], [])

    def test_inner_punctuation_stays_in_the_word(self):
        items = av.split("Edit nginx.conf, then run worker-0.")
        self.assertEqual([it["text"] for it in items if "text" in it], ["Edit", "nginx.conf", "then", "run", "worker-0"])

    def test_whitespace_of_any_kind_separates(self):
        self.assertEqual([it["text"] for it in av.split(" a\tb\n c ")], ["a", "b", "c"])


class TokenizeTest(unittest.TestCase):
    def test_lexicon_first_then_the_phonemizer(self):
        asked = []

        def phonemize(word):
            asked.append(word)
            return fake_phonemize(word)

        items = av.tokenize("Run KUBECTL and kubectl.", {"kubectl": "kjˈuːb kəntɹˌoʊl"}, phonemize)
        self.assertEqual([it.get("ph") for it in items], ["ˈrun", "kjˈuːb kəntɹˌoʊl", "ˈand", "kjˈuːb kəntɹˌoʊl", None])
        # Lexicon words never reach the phonemizer; the case of other words is kept.
        self.assertEqual(asked, ["Run", "and"])

    def test_join_glues_pauses_to_the_word_before(self):
        items = av.tokenize("Hi, there — you!", {}, fake_phonemize)
        self.assertEqual(av.join_phonemes(items), "ˈhi, ˈthere— ˈyou!")

    def test_join_of_a_leading_pause(self):
        self.assertEqual(av.join_phonemes(av.tokenize("— go", {}, fake_phonemize)), "— ˈgo")

    def test_join_of_nothing(self):
        self.assertEqual(av.join_phonemes([]), "")


class FlagsTest(unittest.TestCase):
    def test_flags(self):
        cases = [
            ("CLI", "sˌiːˌɛlˈaɪ", False, ["acronym"]),
            ("CPUs", "sˌiːpˌiːjˈuː", False, ["acronym", "plural-lost"]),
            ("GPUs", "dʒˌiːpˌiːjˈuːz", False, ["acronym"]),
            ("v2", "vˈiːtˈuː", False, ["digits"]),
            ("/data", "dˈeɪɾə", False, ["symbols"]),
            ("--count", "kˈaʊnt", False, ["symbols"]),
            ("worker-0", "wˈɜːkɚ zˈiəɹoʊ", False, ["digits", "symbols"]),
            ("sysctl", "sˈɪstəl", False, ["jargon"]),
            ("hello", "həlˈoʊ", False, []),
            ("it's", "ɪts", False, []),
            ("CLI", "sˌiːˌɛlˈaɪ", True, []),
            ("x", " ", True, ["silent"]),
        ]
        for word, ph, from_lexicon, flags in cases:
            with self.subTest(word=word, from_lexicon=from_lexicon):
                self.assertEqual(av.flags_of(word, ph, from_lexicon), flags)

