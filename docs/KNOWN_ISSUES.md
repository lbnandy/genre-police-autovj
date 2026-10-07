# Known issues / 已知问题

- **Windows x64 only.** The current build targets 64-bit Windows 10 and Windows 11. macOS, Linux, 32-bit Windows and Windows on ARM are not supported in this release.
- **Unsigned executable.** The portable build is not Authenticode-signed, so Windows SmartScreen may show an unknown-publisher warning.
- **Input depends on the selected device.** AutoVJ listens to the chosen DJ Master / Record endpoint and channel pair. A missing endpoint, an incorrect pair or a driver that does not expose loopback audio will produce no usable recognition signal.
- **Catalog results are best effort.** Public metadata can be incomplete or disagree for remixes, compilations, aliases and cross-genre tracks. Manual choices remain available, and online lookup can be disabled.
- **Local AI is hardware dependent.** Whole-track analysis may take longer on CPU-only systems. A failed or unavailable model does not prevent manual genre assignment, but the track must be analyzed again after the underlying problem is fixed.
- **Spout and NDI depend on the venue chain.** Sender and receiver versions, GPU drivers, network configuration and output dimensions should be tested together before a show.
- **High-resolution output needs GPU headroom.** The adaptive render scale and frame-rate cap reduce load, but they cannot guarantee a target frame rate for every genre scene, display scaling or GPU driver.
- **Portable packs do not contain source audio.** An imported pack retains library metadata, analysis and artwork; source files must be present on the show computer if a track needs to be reanalyzed.
- **This is a Beta release.** Long runs, device hot-unplug, unusual mixer routing and multi-display setups still need field testing.
- **Ableton Link requires a connected peer.** The bundled component starts automatically; firewall or local-network restrictions can prevent peer discovery. Enable Link in the other application and verify its beat grid. Silence gating still requires the DJ Master audio input. Adjust the local sync offset for venue audio/video delay. Rekordbox and external-display end-to-end timing has not yet been field-validated.

The current release does not include MIDI/OSC, live recording, virtual-camera output, SRT, RTMP, SMPTE ST 2110 or automatic library merging.

## Video export

Whole-song MP4 export requires the source audio even when an imported library is prepared. Export can take longer than real time, especially at 1080p/60 FPS; it uses fixed quality rather than live adaptive resolution. Current beat analysis runs the causal model ahead of rendering, without offline DBN decoding or beat-grid editing. Clip previews are 720p/30 FPS with a short warm-up and can differ slightly in particle history from the full export. Live recording remains separate and is not implemented.
