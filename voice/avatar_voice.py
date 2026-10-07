#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""An avatar's voice: local text to speech with phoneme, word and viseme timings.

    avatar_voice.py setup                        download and prepare the model (once)
    avatar_voice.py say "Hello!" -o out/hello    -> out/hello.wav + out/hello.json
    avatar_voice.py script script.json -o dir    -> one wav/json pair per line, index.json, lines.js
    avatar_voice.py keys script.json             cache key of every line, as JSON
    avatar_voice.py phonemes "text" | -s script.json   how each word will be pronounced
    avatar_voice.py samples -o dir               audition pack of every preset and stock voice

--voices names the avatar's voice.json (its presets); without it only stock
voice names such as af_heart work. -v/--voice picks the preset (default: the
script's "voice", else voice.json's "default"). --lexicon adds a lexicon file;
repeat it to merge several, later files win.

Words are phonemized one at a time so every phoneme maps back to exactly one
word, and lexicons fix words the phonemizer gets wrong (commands, acronyms).
An engine (voice/engines/) turns the phonemes into audio and phoneme timings;
everything else happens here, so every engine produces the same line JSON.
AVATARS_VOICE_CACHE sets the model directory (default ~/.cache/avatars-voice).
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import wave
from pathlib import Path

import engines
from engines import EngineError, Timing

CACHE = Path(os.environ.get("AVATARS_VOICE_CACHE") or Path.home() / ".cache" / "avatars-voice").expanduser()
# Part of every cache key: change it when this tool turns the same input into other audio or line JSON.
FORMAT = "avatar-voice/1"
ENVELOPE_FPS = 100
SAMPLE = "Hi there! Let's build something together, one step at a time. Ready? Let's go!"

# Phoneme -> viseme (see VISEMES in core/performer.js). Kokoro's vocabulary also
# uses single letters for diphthongs: A=eɪ I=aɪ O=oʊ W=aʊ Y=ɔɪ.
VISEME_OF = {}
for chars, vis in [
    ("aɑæ", "aa"), ("ɐʌəɚᵊɜ", "ah"), ("eɛ", "ee"), ("iɪɨ", "ih"), ("ɔɒo", "oh"), ("uʊɯ", "ou"),
    ("AI", "aa"), ("OWY", "oh"),
    ("pbm", "mbp"), ("fv", "fv"), ("θð", "th"), ("tdnkɡgŋhçxɾ", "cdg"), ("szʦʣ", "sz"),
    ("ʃʒʧʤ", "ch"), ("lɫ", "l"), ("ɹr", "r"), ("wʍ", "w"), ("jʲ", "ih"),
]:
    for c in chars:
        VISEME_OF[c] = vis
STRESS = "ˈˌ"
LENGTH = "ːˑ"
PAUSE = ".,!?;:—…\"()"
# Visemes whose weight is reduced when unstressed.
VOWELS = {"aa", "ah", "ee", "ih", "oh", "ou"}
# A whitespace token: leading quotes and brackets, the word, trailing punctuation.
TOKEN = re.compile(r'^([("\']*)(.*?)([.,!?;:)"\'…—]*)$')
# Trailing punctuation that the model pauses on.
PAUSE_MARKS = ".,!?;:…—"
# Characters a line id must not contain: path separators, and what a URL would cut or decode.
NOT_IN_IDS = "/\\?#%"


def die(msg):
    sys.stderr.write(f"avatar_voice: {msg}\n")
    sys.exit(1)


def numpy():
    """numpy, imported on first use so that `keys` and the tests run without it."""
    try:
        import numpy as np
    except ImportError:
        die("numpy is missing; run: pip install -r voice/requirements.txt")
    return np


def read_json(path, what):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as e:
        die(f"{what} {path}: {e.strerror or e}")
    except ValueError as e:
        die(f"{what} {path}: {e}")


def write_json(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# ------------------------------------------------------ voices, lexicons --
def load_voices(path):
    """voice.json: {"default", "sample", "presets": {name: preset}}; None without --voices."""
    if not path:
        return None
    data = read_json(path, "voices")
    presets = data.get("presets") if isinstance(data, dict) else None
    if not isinstance(presets, dict) or not all(isinstance(p, dict) for p in presets.values()):
        die(f'voices {path}: expected {{"presets": {{name: preset, ...}}}}')
    default = data.get("default")
    if default is not None and default not in presets:
        die(f'voices {path}: the default preset "{default}" is not one of its presets')
    return data


def preset_of(voices, name):
    """(name, preset) for a preset of voice.json or a stock voice of an engine."""
    if voices and name in voices["presets"]:
        preset = dict(voices["presets"][name])
        preset.setdefault("engine", engines.DEFAULT)
        return name, preset
    for engine in engines.names():
        preset = engines.get(engine).stock(name)
        if preset:
            return name, preset
    if voices:
        die(f'unknown voice "{name}": not a preset ({", ".join(voices["presets"])}) and not a stock voice')
    die(f'unknown voice "{name}": not a stock voice; pass the avatar\'s presets with --voices')


def voice_name(args, voices, spec=None):
    """-v, else the script's "voice", else voice.json's "default"."""
    name = getattr(args, "voice", None) or (spec or {}).get("voice") or (voices or {}).get("default")
    if not name:
        die('no voice: pass -v PRESET, or --voices with a voice.json that has a "default"')
    return name


def load_lexicons(files):
    """Merge lexicon files in order, later wins. Keys become lexkey(word)."""
    lexicon = {}
    for f in files or []:
        data = read_json(f, "lexicon")
        words = data.get("words") if isinstance(data, dict) else None
        if not isinstance(words, dict) or not all(isinstance(v, str) for v in words.values()):
            die(f'lexicon {f}: expected {{"words": {{word: phonemes, ...}}}}')
        for k, v in words.items():
            lexicon[lexkey(k)] = v
    return lexicon


def read_script(path):
    """script.json: {"voice": "sindy", "lines": [{"id": "intro", "text": "...", "lead": 0.0}]}"""
    spec = read_json(path, "script")
    lines = spec.get("lines") if isinstance(spec, dict) else None
    if not isinstance(lines, list):
        die(f'script {path}: expected {{"lines": [{{"id": ..., "text": ...}}, ...]}}')
    seen = set()
    for i, line in enumerate(lines):
        if not isinstance(line, dict) or not isinstance(line.get("text"), str) or not isinstance(line.get("id"), str):
            die(f"script {path}: line {i + 1} needs a string id and text")
        lid = line["id"]
        # Ids name the line's files, which the page loads by URL.
        if not lid or any(c in lid for c in NOT_IN_IDS) or lid in (".", ".."):
            die(f'script {path}: line id "{lid}" must be a file name without / \\ ? # %')
        if lid in seen:
            die(f'script {path}: line id "{lid}" appears twice')
        seen.add(lid)
        lead = line.get("lead", 0.0)
        if isinstance(lead, bool) or not isinstance(lead, (int, float)) or lead < 0:
            die(f'script {path}: line "{lid}" has a lead that is not a number of seconds')
    return spec


# ---------------------------------------------------------------- core --
def is_punct(c):
    return c in "`*" or unicodedata.category(c).startswith("P")


def lexkey(word):
    """A word as a lexicon key: lowercase, without surrounding punctuation.

    Punctuation is every Unicode punctuation character plus ` and *, so a word
    in typographic quotes, backticks, brackets or asterisks finds its entry. A
    word of punctuation alone keeps it."""
    key = word.lower()
    i, j = 0, len(key)
    while i < j and is_punct(key[i]):
        i += 1
    while j > i and is_punct(key[j - 1]):
        j -= 1
    return key[i:j] or key


def split(text):
    """Split text into words ({"text", "display"}) and punctuation pauses ({"pause"})."""
    items = []
    for raw in re.findall(r"[^\s]+", text):
        _lead, core, trail = TOKEN.match(raw).groups()
        if core:
            items.append({"text": core, "display": raw})
        for p in trail:
            if p in PAUSE_MARKS:
                items.append({"pause": p})
    return items


def tokenize(text, lexicon, phonemize):
    """Words with their phonemes (from the lexicon, else `phonemize(word)`) and pauses."""
    items = split(text)
    for it in items:
        if "text" in it:
            key = lexkey(it["text"])
            it["ph"] = lexicon[key] if key in lexicon else phonemize(it["text"])
    return items


def join_phonemes(items):
    """The phoneme string of a line: words separated by spaces, pauses glued to the word before."""
    parts = []
    for it in items:
        if "pause" in it:
            if parts:
                parts[-1] = parts[-1].rstrip()
            parts.append(it["pause"] + " ")
        else:
            parts.append(it["ph"] + " ")
    return "".join(parts).strip()


def used_entries(text, lexicon):
    """The lexicon entries a text's words use, sorted: [[word, phonemes], ...]."""
    words = {lexkey(it["text"]) for it in split(text) if "text" in it}
    return sorted([w, lexicon[w]] for w in words if w in lexicon)


def cache_key(text, name, preset, lexicon, version, lead=0.0):
    """12 hex chars over what a line sounds like: text, preset, the lexicon entries it uses.

    Only the entries the line's words use count, so adding an unrelated word to
    a lexicon keeps the key and its audio."""
    payload = [text, name, preset, used_entries(text, lexicon), version]
    if lead:
        payload.append(lead)
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:12]


def key_version(preset):
    return f"{FORMAT} {engines.get(preset.get('engine', engines.DEFAULT)).VERSION}"


class Voice:
    """A preset ready to speak: its engine's speaker and the merged lexicon."""

    def __init__(self, name, preset, lexicon):
        self.name = name
        self.preset = preset
        self.lexicon = lexicon
        self.engine = engines.get(preset.get("engine", engines.DEFAULT))
        self.speaker = self.engine.load(CACHE, preset)

    def tokenize(self, text):
        return tokenize(text, self.lexicon, self.speaker.phonemize)

    def synth(self, text):
        items = self.tokenize(text)
        phonemes = join_phonemes(items)
        audio, sr, timings = self.speaker.synth(phonemes)
        return items, phonemes, audio, sr, timings


def align_words(items, timings):
    """Walk the timed phoneme stream and cut it at the known word boundaries."""
    words = []
    stream = list(timings)
    i = 0
    for it in items:
        if "pause" in it:
            continue
        target = "".join(c for c in it["ph"] if c != " ")
        # skip separators/punctuation before the word
        while i < len(stream) and (stream[i].phoneme in " " or stream[i].phoneme in PAUSE):
            i += 1
        start = stream[i].start if i < len(stream) else (words[-1]["end"] if words else 0)
        consumed = ""
        end = start
        while i < len(stream) and len(consumed) < len(target):
            p = stream[i].phoneme
            if p != " ":
                consumed += p
            end = stream[i].end
            i += 1
        words.append({"text": it["display"], "start": round(start, 3), "end": round(end, 3)})
    return words


def visemes_from(timings):
    """Merge stress/length marks into neighbours and map phonemes to visemes."""
    out = []
    pending_stress = 0.0
    pending_start = None
    for t in timings:
        p = t.phoneme
        if p in STRESS:
            pending_stress = 1.0
            pending_start = t.start if pending_start is None else pending_start
            continue
        if p in LENGTH:
            if out:
                out[-1][1] = t.end
            continue
        if p == " ":
            # Split word gaps between neighbours instead of closing the mouth.
            if out:
                out[-1][1] = (t.start + t.end) / 2
            pending_start = (t.start + t.end) / 2
            continue
        start = pending_start if pending_start is not None else t.start
        pending_start = None
        if p in PAUSE:
            out.append([start, t.end, "sil", 1.0])
            pending_stress = 0.0
            continue
        vis = VISEME_OF.get(p, "cdg")
        w = 1.0
        if vis in VOWELS:
            w = 1.0 if pending_stress else (0.6 if p in "əᵊɐ" else 0.8)
            pending_stress = 0.0
        out.append([start, t.end, vis, w])
    return [[round(a, 3), round(b, 3), v, w] for a, b, v, w in out if b > a]


def envelope(audio, sr):
    """Loudness per 1/ENVELOPE_FPS s: RMS relative to the 95th percentile of voiced frames."""
    np = numpy()
    hop = sr // ENVELOPE_FPS
    n = len(audio) // hop + 1
    padded = np.pad(audio, (0, n * hop - len(audio)))
    rms = np.sqrt((padded.reshape(n, hop) ** 2).mean(axis=1))
    ref = np.percentile(rms[rms > 1e-4], 95) if np.any(rms > 1e-4) else 1.0
    return [round(float(v), 3) for v in np.clip(rms / ref, 0, 1.2)]


def write_wav(path, audio, sr):
    np = numpy()
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def pitch_shift(audio, sr, semitones):
    """Formant-preserving pitch shift (ffmpeg rubberband); keeps the length, so timings hold."""
    np = numpy()
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.wav", Path(tmp) / "out.wav"
        write_wav(src, audio, sr)
        ratio = 2 ** (semitones / 12)
        try:
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                 "-af", f"rubberband=pitch={ratio:.5f}:formant=preserved:transients=smooth", str(dst)],
                check=True,
            )
        except FileNotFoundError:
            die('"pitch" needs FFmpeg with the rubberband filter on the PATH')
        except subprocess.CalledProcessError:
            die('FFmpeg could not shift the pitch; "pitch" needs its rubberband filter')
        with wave.open(str(dst)) as w:
            out = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
    out = out[: len(audio)]
    return np.pad(out, (0, len(audio) - len(out)))


def with_ext(base, ext):
    # Not Path.with_suffix: a dot in a line id is part of its name.
    return base.parent / (base.name + ext)


def render(voice, text, base, lead=0.0, tail=0.15):
    """Synthesize `text` to base.wav/base.json. `lead` seconds of silence first."""
    np = numpy()
    items, phonemes, audio, sr, timings = voice.synth(text)
    if voice.preset.get("pitch"):
        audio = pitch_shift(audio, sr, voice.preset["pitch"])
    peak = float(np.max(np.abs(audio))) if len(audio) else 0
    if peak > 0:
        audio = audio * (0.89 / peak)  # -1 dBFS peak
    pad0 = np.zeros(int(lead * sr), dtype=np.float32)
    pad1 = np.zeros(int(tail * sr), dtype=np.float32)
    audio = np.concatenate([pad0, audio, pad1])
    timings = [Timing(t.phoneme, t.start + lead, t.end + lead) for t in timings]
    base = Path(base)
    base.parent.mkdir(parents=True, exist_ok=True)
    write_wav(with_ext(base, ".wav"), audio, sr)
    meta = {
        "text": text,
        "voice": voice.name,
        "duration": round(len(audio) / sr, 3),
        "sampleRate": sr,
        "phonemes": phonemes,
        "words": align_words(items, timings),
        "visemes": visemes_from(timings),
        "envelope": {"fps": ENVELOPE_FPS, "values": envelope(audio, sr)},
    }
    write_json(with_ext(base, ".json"), meta)
    return meta


def write_index(out, index, metas):
    """index.json for people and tools, lines.js for the episode page."""
    out = Path(out)
    (out / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    # Compositions load timings synchronously from a script tag (no fetch at render time).
    bundle = {}
    for lid, meta in metas.items():
        bundle[lid] = {k: v for k, v in meta.items() if k != "phonemes"}
    (out / "lines.js").write_text(
        "window.AVATAR_LINES = " + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )


def flags_of(word, ph, from_lexicon):
    """Why a word's pronunciation is worth a closer look (see cmd_phonemes)."""
    flags = []
    if not from_lexicon:
        if re.fullmatch(r"[A-Z]{2,}s?", word):
            flags.append("acronym")
        if re.fullmatch(r"[A-Z]{2,}s", word) and not ph.rstrip("ˈˌː ").endswith(("s", "z")):
            flags.append("plural-lost")
        if re.search(r"[0-9]", word):
            flags.append("digits")
        if re.search(r"[^A-Za-z0-9'’-]|(?<![A-Za-z])-|-(?![A-Za-z])", word):
            flags.append("symbols")
        if re.search(r"[bcdfghjklmnpqrstvwxz]{4,}", word.lower()):
            flags.append("jargon")
    if not ph.strip():
        flags.append("silent")
    return flags


# ----------------------------------------------------------------- cli --
def engines_of(voices):
    """The engines the presets use, in order; the default engine without presets."""
    used = []
    for preset in (voices or {}).get("presets", {}).values():
        engine = preset.get("engine", engines.DEFAULT)
        if engine not in used:
            used.append(engine)
    return used or [engines.DEFAULT]


def cmd_setup(args):
    for engine in engines_of(load_voices(args.voices)):
        engines.get(engine).setup(CACHE)


def cmd_say(args):
    voices = load_voices(args.voices)
    name, preset = preset_of(voices, voice_name(args, voices))
    v = Voice(name, preset, load_lexicons(args.lexicon))
    meta = render(v, args.text, args.out, lead=args.lead)
    print(f"{args.out}.wav  {meta['duration']}s  {len(meta['words'])} words")


def script_keys(spec, name, preset, lexicon):
    version = key_version(preset)
    return {
        line["id"]: cache_key(line["text"], name, preset, lexicon, version, line.get("lead", 0.0))
        for line in spec["lines"]
    }


def cached(base, digest):
    """The line JSON at base.json if it was voiced with this cache key and its audio exists."""
    meta_path = with_ext(base, ".json")
    if not meta_path.exists() or not with_ext(base, ".wav").exists():
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except ValueError:
        return None
    return meta if isinstance(meta, dict) and meta.get("hash") == digest else None


def cmd_script(args):
    """script.json: {"voice": "sindy", "lines": [{"id": "intro-1", "text": "...", "lead": 0.5}]}"""
    spec = read_script(args.file)
    voices = load_voices(args.voices)
    name, preset = preset_of(voices, voice_name(args, voices, spec))
    lexicon = load_lexicons(args.lexicon)
    keys = script_keys(spec, name, preset, lexicon)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    voice = None  # loaded for the first line that needs voicing, so a voiced script needs no model
    index, metas = [], {}
    for line in spec["lines"]:
        lid, digest = line["id"], keys[line["id"]]
        base = out / lid
        meta = None if args.force else cached(base, digest)
        if meta is None:
            if voice is None:
                voice = Voice(name, preset, lexicon)
            try:
                meta = render(voice, line["text"], base, lead=line.get("lead", 0.0))
            except EngineError as e:
                die(f'line "{lid}": {e}')
            meta["hash"] = digest
            write_json(with_ext(base, ".json"), meta)
        metas[lid] = meta
        index.append({"id": lid, "duration": meta["duration"], "text": line["text"]})
        print(f"{lid:<24} {meta['duration']:6.2f}s  {line['text'][:60]}")
    write_index(out, index, metas)


def cmd_keys(args):
    """Print {line id: cache key}; needs neither the model nor numpy."""
    spec = read_script(args.file)
    voices = load_voices(args.voices)
    name, preset = preset_of(voices, voice_name(args, voices, spec))
    print(json.dumps(script_keys(spec, name, preset, load_lexicons(args.lexicon)), indent=1))


def cmd_phonemes(args):
    """Print each word's phonemes and where they come from (lexicon or the phonemizer).

    Words that espeak often gets wrong are flagged: acronyms, words with digits
    or symbols (commands, versions, paths), acronym plurals that lose their s,
    consonant clusters that suggest jargon (sysctl), and words that come out
    silent."""
    spec = read_script(args.script) if args.script else None
    voices = load_voices(args.voices)
    if args.voice or voices:
        name, preset = preset_of(voices, voice_name(args, voices, spec))
    else:
        # Phonemizing needs only the engine and the language, so this works without presets.
        name, preset = None, {"engine": engines.DEFAULT}
    v = Voice(name, preset, load_lexicons(args.lexicon))
    if spec:
        text = " ".join(line["text"] for line in spec["lines"])
    else:
        text = args.text or ""
    seen = set()
    for it in v.tokenize(text):
        word = it.get("text")
        if not word or word.lower() in seen:
            continue
        seen.add(word.lower())
        from_lexicon = lexkey(word) in v.lexicon
        source = "lexicon" if from_lexicon else v.engine.PHONEMIZER
        flags = flags_of(word, it["ph"], from_lexicon)
        if args.flagged and not flags:
            continue
        print(f"{word:<20} {it['ph']:<28} {source:<8} {' '.join(flags)}".rstrip())


def cmd_samples(args):
    """Every preset of --voices, then the stock voices of their engines."""
    voices = load_voices(args.voices)
    text = args.text or (voices or {}).get("sample") or SAMPLE
    lexicon = load_lexicons(args.lexicon)
    out = Path(args.out)
    names = list((voices or {}).get("presets", {}))
    for engine in engines_of(voices):
        names += [s for s in engines.get(engine).STOCK if s not in names]
    for n in names:
        v = Voice(*preset_of(voices, n), lexicon)
        meta = render(v, text, out / n)
        print(f"{n:<14} {meta['duration']:5.2f}s")


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        sys.stderr.write(f"avatar_voice: {message}\n")
        sys.exit(2)


def parser():
    ap = Parser(prog="avatar_voice.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def preset_options(p, voice=True):
        p.add_argument("--voices", help="the avatar's voice.json with its presets")
        if voice:
            p.add_argument("-v", "--voice", help="preset, or a stock voice name")
        p.add_argument("--lexicon", action="append", default=[], help="lexicon JSON; repeat to merge, later wins")

    p = sub.add_parser("setup", help="download and prepare the model")
    p.add_argument("--voices", help="set up the engines of these presets (default: kokoro)")
    p.set_defaults(fn=cmd_setup)
    p = sub.add_parser("say", help="voice one text")
    p.add_argument("text")
    p.add_argument("-o", "--out", required=True, help="output base path (no extension)")
    preset_options(p)
    p.add_argument("--lead", type=float, default=0.0, help="seconds of silence before the speech")
    p.set_defaults(fn=cmd_say)
    p = sub.add_parser("script", help="voice every line of a script.json")
    p.add_argument("file")
    p.add_argument("-o", "--out", required=True)
    preset_options(p)
    p.add_argument("--force", action="store_true", help="re-voice every line, cached or not")
    p.set_defaults(fn=cmd_script)
    p = sub.add_parser("keys", help="print the cache key of every line of a script.json")
    p.add_argument("file")
    preset_options(p)
    p.set_defaults(fn=cmd_keys)
    p = sub.add_parser("phonemes", help="show how each word will be pronounced")
    p.add_argument("text", nargs="?")
    p.add_argument("-s", "--script", help="check every word of a script.json")
    preset_options(p)
    p.add_argument("--flagged", action="store_true", help="only words worth a closer look")
    p.set_defaults(fn=cmd_phonemes)
    p = sub.add_parser("samples", help="voice a sample text with every preset and stock voice")
    p.add_argument("-o", "--out", required=True)
    p.add_argument("--text", help="default: voice.json's \"sample\"")
    preset_options(p, voice=False)
    p.set_defaults(fn=cmd_samples)
    return ap


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        args.fn(args)
    except EngineError as e:
        die(str(e))


if __name__ == "__main__":
    main()
