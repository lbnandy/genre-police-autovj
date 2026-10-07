# Changelog

All notable changes to Genre Police AutoVJ are documented here.

## 0.1.2 - 2026-10-08

- Added low, medium and high video quality presets with smaller hardware bitrate targets and matching file-size estimates.
- Added batch video export from selected tracks, shared export settings, per-track results, background progress and collision-safe output names.
- Added whole-song MP4 export from track actions, with local audio, clip previews and separately saved visual settings.
- Added sample-clock rendering, cached sequential beat analysis, cancellable export and a bundled FFmpeg encoder. Live recording and offline DBN decoding are not included.
- Added automatic NVIDIA hardware encoding with a checked software fallback, an explicit software compatibility option and active encoder status.
- Added shared-texture WebCodecs export to avoid full-frame CPU readback, with bounded rendering/encoding overlap and frame-order validation.

- Made library visuals, track video export and batch actions directly accessible in Prepare; refreshed the localized screenshots.
- Removed export startup transitions and paused clip playback during export.
- Separated recent and average render speed, with remaining time based on recent throughput.

## 0.1.1

- Added bundled BeatNet+ streaming beat tracking, EDM beat-boundary correction and silence handling.
- Added automatic, audio and Ableton Link beat sources, with bundled Link discovery and reconnection.
- Added music-responsive and beat-driven impact modes, fixed or music-dependent beat strength, five effect levels and three visual sizes.
- Added screen-impact zoom, distortion, flashes and RGB separation, controlled from Live or the X shortcut.
- Added per-library DJ logos and custom artwork, image cropping, logo sizing, genre-dependent animation and independent visual-element visibility.
- Reorganized preparation, settings and live status controls; refreshed localized screenshots.
- Unified source and packaged beat-model configuration, with model-integrity checks during packaging.

## 0.1.0 - 2026-09-14

- Added a preparation workflow for local DJ libraries, including ID3/Vorbis metadata, optional online catalog lookup, whole-track local AI analysis, manual genre choices and portable library packs.
- Integrated [VJVision](https://github.com/ichiryu0021/VJVision) fingerprint matching, Music Battery evidence and candidate confirmation for live DJ input.
- Kept [Genre Police Visualizer](https://github.com/lbnandy/genre-police-visualizer) visuals, typography, themes, transitions, track metadata and artwork while omitting lyrics from the VJ stage.
- Added stacked and side-by-side layouts, text visibility, condensed English type, standby visuals and one DJ name per library.
- Added window preview, fullscreen external display, Spout and NDI video output with output recovery controls.
- Added frame-rate caps, adaptive render quality, low-load scheduling and a frameless operator console in Simplified Chinese, English, Japanese and Korean.
- Added library rename, full-library deletion, batch track removal, undo, portable import/export and diagnostics export.
