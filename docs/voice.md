# Voice

The host speaks through a local text-to-speech model, Kokoro-82M, driven by
the voice tool `voice/avatar_voice.py`. For every line of an episode's
`script.json` it writes a WAV file and the line's exact word, mouth-shape and
loudness timings, which drive the captions, the lip sync and every cue of the
episode. The tool runs on a CPU, needs no network after setup, and caches
every line, so editing one line voices only that line again.

## Setup

The voice needs Python 3.10 to 3.13 (kokoro-onnx has no packages for 3.14)
and, for pitched presets, FFmpeg with the `rubberband` filter. Once per
machine, in a project:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r node_modules/@dennisklein/avatars/voice/requirements.txt
npx avatars voice-setup
```

`voice-setup` downloads Kokoro v1.0 (about 350 MB) from the kokoro-onnx
release on GitHub, patches it to expose phoneme durations and keeps it in
`~/.cache/avatars-voice`; `AVATARS_VOICE_CACHE` moves it. The CLI runs the
tool with `python3`, the one of the active virtual environment, or with
`AVATARS_PYTHON` (`AVATARS_PYTHON=.venv/bin/python`).

## Voicing an episode

```bash
npx avatars phonemes first-steps --flagged   # words worth a closer look
npx avatars voice first-steps                # episodes/first-steps/assets/voice/
npx avatars voice first-steps --force        # every line again
```

The CLI passes the tool the host avatar's `voice.json`, the preset of the
cast entry and the merged lexicons. `voice` prints every line's duration and
writes `<line>.wav`, `<line>.json` (words, visemes, loudness envelope and the
cache key), `index.json` and `lines.js`, which the page loads. Lines whose
cache key is unchanged and whose WAV exists are skipped.

`npx avatars fixture-voice <id>` writes the same timing files from made-up
timings and no audio: enough for `check`, the gallery and tests, not for a
render.

## Presets

An avatar's `voice.json` holds its presets and the `default`:

```json
{
  "default": "sindy",
  "sample": "Hi, I'm Sindy! Today we'll build something together, one step at a time. Ready? Let's go!",
  "presets": {
    "sindy": { "engine": "kokoro", "mix": { "af_heart": 0.6, "af_bella": 0.4 }, "speed": 1.05, "lang": "en-us" },
    "sindy-soft": { "engine": "kokoro", "mix": { "af_bella": 0.5, "af_aoede": 0.5 }, "speed": 1.0, "lang": "en-us" }
  }
}
```

A Kokoro preset blends stock voices by weight (`mix`) and sets `speed` and
`lang`. `pitch` shifts the voice by semitones with FFmpeg's `rubberband`
filter, keeping formants and length so the timings hold. Sindy's presets are
`sindy` (the default), `sindy-anime` and `sindy-bright` (higher) and
`sindy-soft` (calmer).

A project picks another preset without changing the avatar:
`"voice": "sindy-soft"` in a cast entry (`avatars.json` or `episode.json`)
or in `script.json`. The cast entry wins, then the script, then the avatar's
`default`. To audition every preset and the stock voices:

```bash
AV=$(node -p 'path.dirname(require.resolve("@dennisklein/avatars/package.json"))')
python3 "$AV/voice/avatar_voice.py" samples -o renders/voice-samples --voices "$AV/avatars/sindy/voice.json"
```

## Lexicons

The tool phonemizes word by word with espeak-ng and lets lexicons fix the
words it gets wrong. A lexicon is
`{ "_comment": "…", "words": { word: phonemes } }`: lowercase whole words,
matched case-insensitively with surrounding punctuation stripped, mapped to
espeak IPA with spaces between spoken parts
(`"kubectl": "kjˈuːb kəntɹˌoʊl"`). Three layers merge, later wins:

1. **Library packs**, listed in `avatars.json` `lexicons` without `./`:
   `en-us/core` (general English and software terms) and `en-us/hpc` (HPC
   daemons, commands and libraries).
2. **The avatar's lexicon** (`avatars/<id>/lexicon.json`), inserted after
   the packs: its name and words of the character.
3. **The project's files**, listed with `./` (`./lexicon.json`): its product,
   command and tool names and its domain's jargon.

Almost every new entry belongs in the project's lexicon. A word every project
would say the same way belongs in a library pack, which is a library change.

```bash
npx avatars phonemes first-steps                      # every word of the episode
python3 "$AV/voice/avatar_voice.py" phonemes "system control"   # any text, no lexicons
```

Each row shows the word, its phonemes, their source (`lexicon` or `espeak`)
and flags: `acronym`, `plural-lost`, `digits`, `symbols`, `jargon`, `silent`.
Build a new entry from pieces the tool prints for words that sound right, and
use only symbols it prints: the model silently drops the others.

## Cache keys

A line's cache key covers its text, the preset (its name and settings), only
the lexicon entries its words use, the versions of the tool and the engine,
and its `lead`. So:

- an edited line voices only that line again;
- a new or changed lexicon entry voices again only the lines whose words use
  it, in every episode;
- a changed preset voices every line it speaks;
- entries no line uses change nothing.

The keys are part of the render hash, so a line voiced anew also re-renders
its episode in CI. The key does not cover the espeak-ng version (for words no
lexicon has) or FFmpeg's `rubberband` (pitched presets): after upgrading
either, voice with `--force`. `keys` prints the keys without the model or
numpy, which is why `avatars hash` needs Python but not the model.

## Writing speakable lines

The agent that writes an episode cannot hear it, so lines are written to be
hard to mispronounce. In brief:

- one or two short spoken sentences per line, about 25 words at most;
- contractions, "you" for the viewer, "we" for doing things together, in the
  voice the avatar's `CHARACTER.md` describes;
- commands said the way a person says them ("with the count flag", "worker
  zero", "version two point four"), while the screen shows them exactly;
- punctuation as prosody: a comma pauses, a question mark rises, an em dash
  pauses; no parentheses or semicolons;
- every word a scene cues on appears in its line, ideally once.

The `avatars-voice` skill (`skills/avatars-voice/SKILL.md`) has the full
rules, how to read espeak IPA, which lexicon layer a word belongs in and what
to hand a human listener.

## The tool

```text
python3 voice/avatar_voice.py setup [--voices F]
python3 voice/avatar_voice.py say TEXT -o BASE [--voices F] [-v PRESET] [--lexicon F]... [--lead S]
python3 voice/avatar_voice.py script SCRIPT -o DIR [--voices F] [-v PRESET] [--lexicon F]... [--force]
python3 voice/avatar_voice.py keys SCRIPT [--voices F] [-v PRESET] [--lexicon F]...
python3 voice/avatar_voice.py phonemes [TEXT] [-s SCRIPT] [--voices F] [-v PRESET] [--lexicon F]... [--flagged]
python3 voice/avatar_voice.py samples -o DIR [--voices F] [--lexicon F]... [--text T]
```

`--voices` names an avatar's `voice.json`; without it only stock voice names
such as `af_heart` work as `-v`. `--lexicon` repeats, later files win.
`say` voices one text into `BASE.wav` and `BASE.json`, for trying
alternatives. Errors print as `avatar_voice: <message>`.

Engines live in `voice/engines/`: an engine turns phonemes into audio and
says when each phoneme is spoken, and the tool does everything else, so
every engine produces the same line JSON. Kokoro is the only engine so far;
"Voice" in [DESIGN.md](../DESIGN.md) has the interface for another.
