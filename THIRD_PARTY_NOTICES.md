# Third-party notices

Genre Police AutoVJ integration and interface: LBN, MIT.

Project design, visuals & genre analysis by **LBN**. Audio recognition by **DJ ICHIRYU**.

## Genre Police Visualizer

The visual engine, theme definitions, original visual assets, foreground guitar layer, audio DSP, feature extraction and model adapters are derived from [Genre Police Visualizer](https://github.com/lbnandy/genre-police-visualizer), MIT. The exact source revision and each imported file's SHA-256 digest are recorded in `upstream.lock.json`. Files are kept in `vendor/genre-police` with their copyright and license notices. Local adaptations are recorded separately in `upstream.lock.json`, preserving both the original upstream hash and the adapted file hash.

The original `vendor/genre-police/THIRD_PARTY_NOTICES.md` and `LICENSE` remain part of this distribution. Its desktop application controller is retained only as a versioned source reference for extracting the guitar ornament. It is not executed by AutoVJ.

## VJVision

Fingerprinting, alignment, WASAPI capture and the Music Battery decision engine are derived from [VJVision](https://github.com/ichiryu0021/VJVision), copyright ichiryu, MIT.

**Music Battery (ChargeBar) engine by ichiryu, from VJVision (https://github.com/ichiryu0021/VJVision), MIT License.**

The original license and engine attribution are included in `vendor/vjvision`. Core fingerprint and Music Battery source files are unchanged. The new host and generated capture adapter provide stable device selection, PCM forwarding and a Qt-free process protocol.

VJVision's vendored PFFFT is distributed under its retained BSD-style license; dr_flac and dr_mp3 offer public-domain or MIT-0 licensing; SQLite is public domain. Their source notices remain in the source distribution and selected headers are included with the application notices.

The DJ ICHIRYU wordmark in `assets/credits/dj-ichiryu.png` was supplied for this project. It is displayed unchanged with layout clipping in the credits; the application code license does not grant rights to the wordmark.

## Optional Ableton Link connection

AutoVJ bundles a Windows x64 **Carabiner 1.2.0** executable with the documented AutoVJ UDP receive recovery patch as a separate program and reads its documented loopback TCP protocol. Carabiner and its embedded Ableton Link/Mongoose code use GPL terms, separate from AutoVJ's original MIT code. It is not linked into the Electron application. Copyright notices, license texts, pinned source revisions, and the complete corresponding source archive (including recursive submodules and build files) accompany the application in `resources/carabiner/`. The same materials are in `vendor/carabiner/` in this repository. The manifest pins the original source and patch by SHA-256; a build receipt verifies the compiled executable. The patch and rebuild instructions accompany the corresponding source. This integration does not imply endorsement by Ableton. Source: [Deep Symmetry / Carabiner](https://github.com/Deep-Symmetry/carabiner/tree/v1.2.0).

## Models

- **Discogs-EffNet**: Music Technology Group, Universitat Pompeu Fabra. Model weights and metadata have a separate **non-commercial Essentia Models license**, not this application's MIT license. Full terms: `vendor/genre-police/assets/models/ESSENTIA-MODELS-LICENSE.txt`. Model source: [Essentia Discogs-EffNet](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/). Commercial use of this bundled model requires appropriate permission or an alternative licensed model. Local AI can be disabled; manual genre assignment, saved results and native fingerprints remain usable.
- **BeatNet**: the bundled weight and adaptation notice use CC BY 4.0. See `vendor/genre-police/assets/models/BEATNET-CC-BY-4.0.txt`.
- **ONNX Runtime**: Microsoft, MIT, with the package's license and third-party notices.

## Video output

Spout DirectX source is copyright Lynn Jarvis and contributors, BSD-2-Clause,
from [Spout2](https://github.com/leadedge/Spout2) at
`c2bcc12147711d12ace7d5f08e869d774d840f8a`. Its complete license is included in
`vendor/spout/LICENSE` and `licenses/Spout-LICENSE.txt` in the distribution.

[NDI®](https://ndi.video/) High Bandwidth sending uses the standard SDK 6.3.2.
The SDK headers retain their individual MIT notices; the app-local
`Processing.NDI.Lib.x64.dll` is proprietary and separately licensed. It is not
covered by AutoVJ's MIT license. The runtime's full third-party notices, SDK
license agreement and end-user terms are supplied in `licenses` (source path
`assets/licenses`). No NDI Tools or Advanced SDK trial components are bundled.

NDI® is a registered trademark of Vizrt NDI AB.

## Fonts and runtime

Interface icons in `assets/material-symbols` use Google Material Symbols Rounded (Apache-2.0), downloaded from the official [Google repository](https://github.com/google/material-design-icons). The unmodified SVGs, complete license and pinned source URLs/hashes are retained in that directory.

The newly generated application icon in `assets/icon.png` is separate from the desktop visualizer icon. See `assets/ICON-DESIGN.md` for its generation brief.

Fontsource fonts and Smiley Sans keep their OFL-1.1 notices. Each installed font package contains its license; Smiley Sans's notice is retained in the original assets directory. Electron, Chromium, Node.js and Electron's FFmpeg component retain the runtime distribution licenses. `music-metadata` is distributed under its package's MIT license.

## Online services

Only preparation mode contacts the Apple music catalog and Deezer catalog. When online lookup is enabled, the first online analysis in each app session also makes a bounded Cloudflare trace request to determine the network exit country; only the country code is cached. A China network uses Apple CN first (US fallback) and skips Deezer. UI language is not used as a region signal. These external services are not bundled code. Preparation sends track title and artist, checks version and duration, and caches returned genre metadata. Audio files are not uploaded. Their availability and metadata quality are outside this application's control. The live performance path does not call these services.

### BeatNet beat particle filter

The JavaScript beat-stage decoder is ported from Mojtaba Heydari’s [BeatNet](https://github.com/mjhydri/BeatNet/blob/81cedd4beeb7235262db80969a0c9ce9a48a0ed4/src/BeatNet/particle_filtering_cascade.py), under CC BY 4.0. The base filter preserves upstream prior-population decoding, observation thresholds, tempo transitions and strong-activation rejuvenation. AutoVJ adds a 20 ms boundary tolerance and an evidence-backed periodicity lock with bounded weak-pulse recovery for EDM beat activations; these timing adaptations are not part of upstream BeatNet. Integration changes include an audio-frame clock, discontinuity resets and omission of the downbeat/meter stage. One maintenance correction restores the configured particle count after rejuvenation: upstream discards the return value of `np.delete`, allowing population growth. BeatNet+ uses the boundary correction only; the older model’s periodicity lock and weak-pulse recovery are not enabled for BeatNet+. The bundled BeatNet license text applies to this decoder port. This port is not upstream-endorsed and is not identical to the complete Python cascade.

### BeatNet+ model

The bundled generic ONNX weights were exported from Mojtaba Heydari’s BeatNet-Plus at revision `bb90eb0a9065b101a4b4c4cb2b2061950266cb4b`. Source: https://github.com/mjhydri/BeatNet-Plus. Export provenance and hashes are in `assets/models/beatnet-plus/provenance.json`. This adaptation uses streaming ONNX inference and a 20 ms beat boundary correction; it is not upstream-endorsed. The pinned repository does not contain a top-level license file; no additional license grant for these weights is asserted here.

## Video export encoder

Offline video export invokes FFmpeg as a separate process. The Windows x64 binary is FFmpeg 6.1.1 essentials from Gyan, distributed by `ffmpeg-static` 5.3.0 (binary release `b6.1.1`), with GPL v3 enabled and libx264 for H.264 encoding. It is separate from Electron's FFmpeg runtime component. The binary hash and original source/build links are in `assets/licenses/ffmpeg-provenance.json`; the original GPL license and build README are retained beside it and shipped in the portable distribution's `licenses` directory. The npm package retains its own GPL-3.0-or-later license. Binary distribution and build information: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1 and https://www.gyan.dev/ffmpeg/builds/ . FFmpeg source revision: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93 .
