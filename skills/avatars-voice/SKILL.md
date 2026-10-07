---
name: avatars-voice
description: Write and check an avatar's narration for avatars library episodes — speakable script.json lines, pronunciation checks with phonemes --flagged, lexicon entries in the right layer (library pack, avatar lexicon, project lexicon), voicing with the local Kokoro voice tool and its per-line cache, and the avatar's voice presets and model setup. Use whenever narration is written or edited, a word is or might be mispronounced (commands, acronyms, versions, paths, flags, names), or the voice, speed, pitch, presets or voice model come up.
---

# Narration and pronunciation

The host speaks through Kokoro-82M, a local text-to-speech model, driven by
the library's voice tool (`voice/avatar_voice.py`). Each line of an episode's
`script.json` becomes a WAV file plus exact word and mouth-shape timings,
which drive captions, lip sync and every cue in the episode. You cannot
listen to the result, so the job is to write text that is hard to
mispronounce, check the phonemes you can read, and hand a human a short list
of what to listen for.

The CLI runs the voice tool for an episode with the host's presets and the
project's lexicons. For anything else, call the tool in the installed
library directly:

```bash
AV=$(node -p 'path.dirname(require.resolve("@dennisklein/avatars/package.json"))')
python3 "$AV/voice/avatar_voice.py" --help
```

## Settled decisions

How an avatar sounds belongs to the avatar: its `voice.json` holds the
presets and the `default` one, and its `CHARACTER.md` says how it talks and
how its name is said. Read both first (`$AV/avatars/<avatar>/`, or
`library/avatars/<avatar>/` for a project avatar). Ask the avatar's
maintainer before changing a preset or the default: each change voices every
line that preset speaks again, in every project that casts the avatar, and
re-renders those episodes.

A project picks another preset of the same avatar without changing it: in a
cast entry (`"voice": "<preset>"` in `avatars.json` or an episode's
`episode.json`) or in `script.json` (`"voice"`). The cast entry wins, then
the script, then the avatar's `default`.

## Writing lines

`script.json` is `{ "lines": [{ "id": "intro", "text": "…" }] }`; a line may
add `"lead"`, seconds of silence before it. One line is one beat of the
episode: the unit that scenes say, captions break on and cues refer to. Line
ids name files, so they are unique and contain no slashes.

- **One or two short sentences per line**, about 25 words at most. The
  model reads at most 510 phonemes (about 50 words) at once and cuts longer
  lines at a sentence end or a comma, where the intonation can start over;
  long lines are also hard to cue and to act.
- **Spoken English, not docs English.** Contractions (we'll, it's, you're),
  "you" for the viewer, "we" for doing things together, in the personality
  the avatar's `CHARACTER.md` describes. Say what is about to appear before
  it appears: "Now, the status command shows that it's up and running."
- **Say commands the way a person would.** The screen shows the exact
  command; the narration names it. Plain command words read well, and the
  lexicons cover common tools. Leave out flags' dashes and symbols: "with the
  count flag" or "add three workers" instead of `--count 3`, "the data
  directory" instead of `/data` (read as "slash data"), "worker zero"
  instead of `worker-0`, "version two point four" instead of `2.4`. Two
  dashes (`--`) are read as nothing at all.
- **Punctuation is prosody.** A period is a full stop, a comma a short pause,
  an exclamation mark adds energy, a question mark rises, an em dash (—)
  pauses. Avoid parentheses and semicolons. Captions also break at commas,
  so commas in long sentences help readability twice.
- **Cue words.** Scenes time events to words: `"what:network"` means the
  first word in line `what` that starts with "network" (case and punctuation
  ignored). Make sure each word you will cue on appears in the line, ideally
  once; otherwise the episode uses `word#1` for the second match.
- **Length budget.** The host speaks about 2.8 words per second. Read each
  line against what is on screen meanwhile: a command plus its output needs
  the line to last at least as long as typing and reading take.

## Checking pronunciation

Before voicing, list how every word will be pronounced, from the project
root:

```bash
npx avatars phonemes <id> --flagged                          # words worth a look
npx avatars phonemes <id>                                    # every word
python3 "$AV/voice/avatar_voice.py" phonemes "any text here"  # any text, no lexicons
```

Each row shows the word, its phonemes, their source (`lexicon` or `espeak`)
and flags: `acronym`, `plural-lost` (an acronym plural that loses its s:
`CPUs` sounds like `CPU`), `digits`, `symbols`, `jargon` (consonant clusters
such as `systemctl`) and `silent` (comes out as nothing). Words from a
lexicon are only flagged when silent. Add `--lexicon FILE` (repeatable,
later wins) to the direct call to see entries applied.

Read the IPA of every flagged word and of every product, command or tool
name, even unflagged ones: espeak guesses unknown words from their spelling,
so `etcd` comes out unflagged as one syllable, *etkd*. Also read the full
list for words that are both noun and verb (record, present, object,
increase, interrupt): espeak picks one stress for both, often the wrong one.

Reading espeak IPA: `ˈ` marks primary stress before the stressed syllable,
`ˌ` secondary stress, `ː` a long vowel. `ɪ` as in *sit*, `i` as in *see*, `ɛ`
*bed*, `æ` *cat*, `ʌ` *cup*, `ɑ` *father*, `ɔ` *law*, `ʊ` *put*, `u` *food*,
`ə` *about*, `ɚ` *butter*, `ɜː` *bird*, `eɪ` *day*, `aɪ` *my*, `oʊ` *go*, `aʊ`
*now*, `ɹ` r, `ʃ` *sh*, `ʒ` *measure*, `tʃ` *ch*, `dʒ` *j*, `θ` *thin*, `ð`
*this*, `ŋ` *sing*, `ɾ` the flapped t in *data*.

## Lexicons

A lexicon is `{ "_comment": "…", "words": { "word": "phonemes" } }`. Keys
are lowercase whole words, matched case-insensitively with surrounding
punctuation stripped (`config.yaml` and `worker-0` are words); values are
espeak IPA with spaces between spoken parts. Three layers merge in this
order, later wins:

1. **Library packs** listed in `avatars.json` `lexicons` without `./` or
   `../`, in their order: `en-us/core` (general English and software terms)
   and `en-us/hpc` (HPC daemons, commands and libraries). Pack names resolve
   in the project's `library/lexicons/<lang>/` first, then in the library.
2. **The avatar's lexicon** (`lexicon.json` next to its `avatar.json`),
   inserted right after the packs: its own name and words of the character.
3. **Project files** listed with `./` (`./lexicon.json`): the project's
   names, commands and jargon.

Which file a new entry belongs in:

- **The project lexicon**, almost always: the project's product, command and
  tool names, its domain's jargon, and any pack entry the project wants said
  differently (it wins over packs and the avatar).
- **The avatar's lexicon**: only words about the character, such as its
  name. A project never edits an installed avatar's files.
- **A library pack**: a word every project would say the same way (common
  software terms, a domain's standard commands). That is a library change
  (`avatars-design` skill) and reaches projects when they upgrade; until
  then, the entry goes in the project lexicon too.

## What voices again

Each line's cache key covers its text, the preset (name and settings), the
lexicon entries its words use, the voice tool's and engine's versions and its
`lead`. So:

- a new or changed lexicon entry voices again only the lines whose words use
  it, in every episode;
- an edited line voices again only that line;
- a changed preset voices again every line it speaks;
- entries no line uses change nothing.

A line that is voiced again changes the episode's render hash, so the
episode re-renders where the project builds it (`avatars ci`). Give lexicon
changes their own commit all the same.

The key does not cover the espeak-ng version (it phonemizes words that no
lexicon has) or FFmpeg's rubberband filter (pitch presets): after upgrading
either, `npx avatars voice <id> --force` voices every line again.

## Fixing a mispronunciation

Prefer the cheapest fix that lasts:

1. **Rephrase** when the word is a one-off or should not be spoken at all:
   "worker zero", "the count flag", "version two point four", "a CPU limit of
   two" instead of "two CPUs", "cancel" instead of "interrupt".
2. **Add a lexicon entry** (see "Lexicons" for which file) when the term
   recurs. Build the value from pieces the tool prints for words that sound
   right:

   ```bash
   python3 "$AV/voice/avatar_voice.py" phonemes "system control"
   # system → sˈɪstəm, control → kəntɹˈoʊl
   ```

   then add `"systemctl": "sˈɪstəm kəntɹˈoʊl"` and run `npx avatars
   phonemes <id>` again to see the entry used (source `lexicon`). Use only
   symbols the tool prints; Kokoro silently drops anything outside its
   vocabulary. Follow the conventions of the existing entries, which each
   pack's `_comment` describes.

## Voicing

```bash
npx avatars voice <id>            # episodes/<id>/assets/voice/, git-ignored
npx avatars voice <id> --force    # every line again, cached or not
```

It prints each line's duration and voices only lines whose cache key
changed; it writes `<line>.wav`, `<line>.json` (words, visemes, envelope),
`index.json` and the `lines.js` the page loads. For quick experiments
outside an episode:

```bash
python3 "$AV/voice/avatar_voice.py" say "Run the build, then check the logs." -o renders/try/a \
  --voices "$AV/avatars/<avatar>/voice.json" --lexicon ./lexicon.json
```

writes `renders/try/a.wav` and `.json` for a human to compare alternatives;
`-v <preset>` picks another preset. Without the model,
`npx avatars fixture-voice <id>` writes narration with plausible timings and
no audio, enough for layout work and `check` but not for a render; it
replaces voiced timings, so the next `voice` run voices every line again.

## What to hand a human

The agent cannot hear tone, pacing or a wrong stress. When an episode is ready
for review, list for the listener:

- every word `--flagged` showed and every lexicon entry added or changed,
  with the line it is in;
- lines where the meaning depends on emphasis or a question intonation;
- names of people, projects or sites.

## Presets and the model

`voice.json` is `{ "default", "sample", "presets": { name: preset } }`. A
preset names its `engine` (default `kokoro`); Kokoro presets blend stock
voices by weight in `mix` and set `speed` (default 1.0) and `lang` (default
`en-us`). Any preset may set `pitch` in semitones, which the tool applies
with FFmpeg's `rubberband` filter, keeping formants and length so the
timings hold; check for it with `ffmpeg -hide_banner -filters | grep
rubberband`. `-v` also accepts the engine's stock voice names (`af_heart`),
which work without `--voices`. An audition pack of every preset, then the
stock voices, with `voice.json`'s `sample` text unless `--text` is given:

```bash
python3 "$AV/voice/avatar_voice.py" samples -o renders/voice-samples --voices "$AV/avatars/<avatar>/voice.json"
```

Setup, once per machine:

```bash
python3 --version                              # 3.10 to 3.13
pip install -r "$AV/voice/requirements.txt"    # kokoro-onnx 0.6.1, onnx, numpy
npx avatars voice-setup                        # the model of every engine the cast's presets use
```

`voice-setup` downloads Kokoro v1.0 (about 350 MB) from the kokoro-onnx
release on GitHub and patches it to expose phoneme durations, into
`AVATARS_VOICE_CACHE` (default `~/.cache/avatars-voice`); point that
variable at a model set up elsewhere. Known failures:

- Python 3.14: "No matching distribution found for kokoro-onnx", because
  kokoro-onnx supports 3.10 to 3.13. Make a venv from 3.12.
- pip refuses the system Python ("externally-managed-environment"): use a
  venv, activated in every shell, or `AVATARS_PYTHON=.venv/bin/python`,
  which the CLI then runs instead of `python3`.
- `kokoro-onnx is missing` or `model missing, run: avatar_voice.py setup`:
  the packages or the model are not where the running Python and
  `AVATARS_VOICE_CACHE` look.
- `"pitch" needs FFmpeg with the rubberband filter on the PATH`, or `FFmpeg
  could not shift the pitch`: install an FFmpeg build with rubberband, or use
  a preset without `pitch`.

`npx avatars hash` and the voice tool's `keys` need Python but neither the
model nor numpy; `phonemes` loads the model (about 2 s), because the model's
vocabulary decides which phonemes survive.
