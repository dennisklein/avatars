# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""Kokoro-82M through kokoro-onnx, on the CPU.

The upstream ONNX export only returns audio. `setup` adds the duration
predictor's per-token frame counts as a second output named "duration", which
kokoro-onnx then turns into phoneme timings. Words that no lexicon has are
phonemized by espeak-ng, through kokoro-onnx's tokenizer.

Presets: {"engine": "kokoro", "mix": {voice: weight, ...}, "speed": 1.0,
"lang": "en-us"}; the mix blends stock voice styles by weight.
"""

import urllib.request

from . import EngineError

# Part of every cache key: bump it when kokoro-onnx, the model or this module change the audio or timings.
VERSION = "kokoro-v1.0-timed/1"
PHONEMIZER = "espeak"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
MODEL = "kokoro-v1.0-timed.onnx"
UPSTREAM = "kokoro-v1.0.onnx"
VOICES = "voices-v1.0.bin"
# The tensor that holds the duration predictor's frame count per token.
DURATION_TENSOR = "/encoder/Gather_output_0"

# The voices in voices-v1.0.bin, so stock names resolve without loading it.
STOCK_VOICES = (
    "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova",
    "af_river", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam",
    "am_michael", "am_onyx", "am_puck", "am_santa", "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
    "bm_daniel", "bm_fable", "bm_george", "bm_lewis", "ef_dora", "em_alex", "em_santa", "ff_siwis",
    "hf_alpha", "hf_beta", "hm_omega", "hm_psi", "if_sara", "im_nicola", "jf_alpha", "jf_gongitsune",
    "jf_nezumi", "jf_tebukuro", "jm_kumo", "pf_dora", "pm_alex", "pm_santa", "zf_xiaobei", "zf_xiaoni",
    "zf_xiaoxiao", "zf_xiaoyi", "zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang",
)
# The audition pack of `samples`.
STOCK = ("af_heart", "af_bella", "af_nicole", "af_sky", "af_aoede", "af_kore", "af_nova", "bf_emma")

INSTALL = "run: pip install -r voice/requirements.txt"


def stock(name):
    if name not in STOCK_VOICES:
        return None
    return {"engine": "kokoro", "mix": {name: 1.0}, "speed": 1.0, "lang": "en-us"}


# --------------------------------------------------------------- setup --
def _download(name, dest):
    print(f"downloading {name} ...")
    part = dest.with_name(dest.name + ".part")
    try:
        urllib.request.urlretrieve(f"{RELEASE}/{name}", part)
    except OSError as e:
        part.unlink(missing_ok=True)
        raise EngineError(f"downloading {name} failed: {e}") from e
    # Renamed only when complete, so an interrupted download is not mistaken for the file.
    part.replace(dest)


def setup(cache):
    cache.mkdir(parents=True, exist_ok=True)
    model, raw, voices = cache / MODEL, cache / UPSTREAM, cache / VOICES
    for path in (raw, voices):
        if path == raw and model.exists():
            continue
        if not path.exists():
            _download(path.name, path)
    if not model.exists():
        try:
            import onnx
            from onnx import TensorProto, helper
        except ImportError as e:
            raise EngineError(f"onnx is missing; {INSTALL}") from e

        print("exposing the duration predictor as a model output ...")
        m = onnx.load(str(raw))
        names = {o for n in m.graph.node for o in n.output}
        if DURATION_TENSOR not in names:
            raise EngineError(f"tensor {DURATION_TENSOR} not found; the upstream export changed")
        m.graph.node.append(helper.make_node("Identity", [DURATION_TENSOR], ["duration"], name="expose_duration"))
        m.graph.output.append(helper.make_tensor_value_info("duration", TensorProto.INT64, ["sequence_length"]))
        onnx.save(m, str(model))
    raw.unlink(missing_ok=True)  # only the patched model is used
    print(f"ready: {model}")


# ---------------------------------------------------------------- core --
_models = {}


def _kokoro(cache):
    """One Kokoro instance per cache directory, shared by every preset."""
    model = cache / MODEL
    if not model.exists():
        raise EngineError("model missing, run: avatar_voice.py setup")
    if model not in _models:
        try:
            from kokoro_onnx import Kokoro
        except ImportError as e:
            raise EngineError(f"kokoro-onnx is missing; {INSTALL}") from e
        _models[model] = Kokoro(str(model), str(cache / VOICES))
    return _models[model]


class Speaker:
    """One preset on a shared Kokoro instance: its blended voice style, speed and language."""

    def __init__(self, k, preset):
        self.k = k
        self.speed = preset.get("speed", 1.0)
        self.lang = preset.get("lang", "en-us")
        self.style = self._blend(preset["mix"]) if "mix" in preset else None

    def _blend(self, mix):
        weights = mix.values() if isinstance(mix, dict) else ()
        if not weights or not all(isinstance(w, (int, float)) and not isinstance(w, bool) for w in weights):
            raise EngineError('a kokoro preset needs "mix": {voice: weight, ...}')
        unknown = [name for name in mix if name not in STOCK_VOICES]
        if unknown:
            raise EngineError(f"unknown Kokoro voice {', '.join(unknown)} in the mix")
        total = sum(mix.values())
        if not total > 0:
            raise EngineError("the mix weights must add up to more than 0")
        import numpy as np

        return sum(self.k.get_voice_style(name) * (w / total) for name, w in mix.items()).astype(np.float32)

    def phonemize(self, word):
        return self.k.tokenizer.phonemize(word, lang=self.lang)

    def synth(self, phonemes):
        if self.style is None:
            raise EngineError('the preset has no "mix"')
        import numpy as np

        try:
            audio, sr, timings = self.k.create_timed(
                phonemes,
                voice=self.style,
                speed=self.speed,
                lang=self.lang,
                is_phonemes=True,
            )
        except ValueError as e:
            raise EngineError(f"kokoro: {e}") from e
        if not timings:
            raise EngineError("model returned no timings; re-run setup")
        return np.asarray(audio, dtype=np.float32), sr, timings


def load(cache, preset):
    return Speaker(_kokoro(cache), preset)
