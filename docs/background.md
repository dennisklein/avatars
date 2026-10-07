# Background

Can coding agents produce tutorial videos for documentation, as a screencast
and slideshow hybrid presented by an AI anime avatar, cheaply enough to
render them again whenever the docs change? This library is the answer of a
feasibility study: yes, on a CPU. This page keeps the study's measurements,
the avatar approaches it compared and its sources.

## Results

Measured on the study's pilot episode in a 4 vCPU cloud container without a
GPU:

| What | Result |
| --- | --- |
| Text to speech | about 3× faster than real time (a 6.8 s line in 3.4 s, including loading the model) |
| Render | 45 s of 1080p30 in about 1.5 min (software GL, 2 workers) |
| Audio sync | speech onset in the MP4 matches the plan to 10 ms |
| Determinism | a frame-difference scan found no glitch frames at worker boundaries |
| Lint | `hyperframes lint`: 0 errors, 0 warnings |
| Size | about 4 MB per minute (H.264 CRF 28, `-tune animation`) |

At that size ten 3-minute videos take about 120 MB per docs version, well
under the 1 GB limit of a GitHub Pages site, whose 100 GB per month soft
bandwidth limit allows roughly 8,000 full views a month.

The library is a port of the study's single-avatar pipeline into layers
(tokens, themes, formats, scenes, rigs, parts, looks, avatars, voices). The
study's episodes render the same frames with it, apart from the intro's
brand mark, which now draws exactly as its SVG file does, and the raster
noise described in [pitfalls.md](pitfalls.md).

The renders also show what does not work yet:

- The avatar faces the camera. Head turns are faked with parallax, and the
  only arm motion is the wave.
- Kokoro has no emotion control, and a voice can only be a blend of its stock
  voices.

## Avatar options

| Approach | Anime quality | CPU only | Seekable | Cost | Notes |
| --- | --- | --- | --- | --- | --- |
| **Code-drawn SVG rig (this library)** | medium | yes | pure f(t) | $0 | agent-editable, versioned in git, no art pipeline |
| Layered art (PNGTuber style) | medium–high | yes | pure f(t) | commission | the same rig interface, with bitmap layers in the slots instead of drawn parts |
| Live2D | high | yes (slow) | physics must be re-simulated or pre-rendered | rig $200–3,500 plus art | Cubism Core is proprietary; check its licence for your organisation |
| VRM 3D (VRoid and three-vrm) | medium–high | yes (slow) | spring bones must be re-simulated | $0 | free VRoid Studio, a generic look unless customised |
| Generative video (HeyGen, Hedra, Kling) | high, but drifts | no | no | about $0.03–0.12 per second rendered | every script edit generates again; good for a one-off intro |

The rig's interface (visemes `aa ih ou ee oh …`, expressions, gaze,
gestures) deliberately matches VRM and Live2D concepts, so the drawing can
be upgraded without changing episode scripts.

## Sources

- HyperFrames: [repository](https://github.com/heygen-com/hyperframes),
  [skills](https://github.com/heygen-com/hyperframes/tree/main/skills)
- Kokoro: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M),
  [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx)
- Lip sync: [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync),
  [VRM 1.0 expressions](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/expressions.md),
  [Live2D lip sync](https://docs.live2d.com/en/cubism-sdk-manual/lipsync/)
- Avatars: [three-vrm](https://github.com/pixiv/three-vrm),
  [TalkingHead](https://github.com/met4citizen/TalkingHead),
  [HeadTTS](https://github.com/met4citizen/HeadTTS),
  [Live2D SDK licence](https://www.live2d.com/en/sdk/license/),
  [VRoid commercial use](https://vroid.pixiv.help/hc/en-us/articles/4405813333657-Can-I-use-the-models-created-with-VRoid-Studio-Stable-Ver-for-commercial-purposes)
- Generative: [HeyGen Avatar IV](https://www.heygen.com/avatars/avatar-iv),
  [Hedra Character-3](https://www.hedra.com/models/video/hedra/character-3),
  [LivePortrait](https://liveportrait.github.io/)
- Hosted text to speech: [ElevenLabs with timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps),
  [Azure visemes](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme)
- Disclosure: [EU AI Act Article 50 FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act)
