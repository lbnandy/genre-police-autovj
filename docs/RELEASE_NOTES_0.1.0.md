# Genre Police AutoVJ 0.1.0 Beta

[简体中文](#简体中文) · [English](#english) · [日本語](#日本語)

## 简体中文

Genre Police AutoVJ 是面向 DJ 现场演出的自动 VJ 工具：演出前分析本地曲库，现场监听 DJ Master / Record 音频输入识别当前曲目，并驱动 [Genre Police Visualizer](https://github.com/lbnandy/genre-police-visualizer) 的曲风视觉。

### 下载

- `Genre-Police-AutoVJ-0.1.0-portable.exe`
- `SHA256SUMS.txt`

本版适用于 Windows 10/11 x64。下载 EXE 后即可运行，不需要另行安装 Node.js、Python 或 AI 运行环境。版本未进行 Authenticode 代码签名，Windows SmartScreen 可能显示“无法识别的发布者”。

### 主要功能

- 前置分析本地曲库，读取 ID3 / Vorbis 标签，支持 Apple / Deezer 资料、整曲本地 AI 和手动曲风设置。
- 现场使用 [VJVision](https://github.com/ichiryu0021/VJVision) 进行指纹匹配、音乐电量证据累积和候选确认。
- 沿用 [Genre Police Visualizer](https://github.com/lbnandy/genre-police-visualizer) 的视觉结构、背景、字体、配色、动态效果和过渡，保留曲名、艺人和封面，不显示歌词。
- 支持上下 / 左右布局、文字开关、英文窄体、待机视觉、每套曲库一个 DJ 名字，以及中英日韩界面。
- 支持窗口预览、全屏外接屏幕、Spout、NDI、帧率上限、自适应渲染质量和低负载模式，并提供曲库重命名、整库删除、批量移除、撤销和便携曲库包。

### 已知限制

当前只提供 Windows x64 版本，仍需使用目标声卡、显卡、显示设备和 NDI / Spout 接收端进行现场测试。AutoVJ 只监听 DJ Master / Record 输入，不播放音乐；MIDI / OSC、录像、虚拟摄像头、SRT、RTMP、SMPTE ST 2110 和自动合并曲库不在本版本范围内。

[完整说明](https://github.com/lbnandy/genre-police-autovj/blob/main/README.md) · [隐私说明](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [已知限制](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [反馈问题](https://github.com/lbnandy/genre-police-autovj/issues)

## English

Genre Police AutoVJ is an automatic VJ tool for DJ performances. It analyzes a local library before a show, listens to a DJ Master / Record audio input to recognize the current track, and drives the genre-aware visuals of [Genre Police Visualizer](https://github.com/lbnandy/genre-police-visualizer).

### Download

- `Genre-Police-AutoVJ-0.1.0-portable.exe`
- `SHA256SUMS.txt`

This build supports Windows 10/11 x64. Download and run the EXE; Node.js, Python, and a separate AI runtime are not required. The build is not Authenticode-signed, so Windows SmartScreen may show an “Unknown publisher” warning.

### Highlights

- Pre-show local-library analysis with ID3 / Vorbis tags, Apple / Deezer metadata, whole-track local AI, and manual genre choices.
- Live fingerprint matching, music-charge evidence accumulation, and candidate confirmation through [VJVision](https://github.com/ichiryu0021/VJVision).
- [Genre Police Visualizer](https://github.com/lbnandy/genre-police-visualizer) visual structure, backgrounds, typography, colour, motion, and transitions, with track title, artist, and artwork; lyrics are omitted.
- Stacked / split layouts, text visibility, condensed English type, standby visuals, one DJ name per library, and Chinese, English, Japanese, and Korean UI languages.
- Window preview, fullscreen external display, Spout, NDI, frame-rate caps, adaptive render quality, low-load mode, and portable library management.

### Known limitations

Windows x64 only, and the target audio device, GPU, display, and Spout / NDI receiver should be tested before a show. AutoVJ listens to the DJ Master / Record input but does not play audio. MIDI / OSC, recording, virtual-camera output, SRT, RTMP, SMPTE ST 2110, and automatic library merging are outside this release.

[Full README](https://github.com/lbnandy/genre-police-autovj/blob/main/README.en.md) · [Privacy](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [Known limitations](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [Report an issue](https://github.com/lbnandy/genre-police-autovj/issues)

## 日本語

Genre Police AutoVJ は DJ の現場向け自動 VJ ツールです。本番前にローカルライブラリを分析し、現場では DJ Master / Record の音声入力から現在の曲を認識して、[Genre Police Visualizer](https://github.com/lbnandy/genre-police-visualizer) のジャンルビジュアルを動かします。

### ダウンロード

- `Genre-Police-AutoVJ-0.1.0-portable.exe`
- `SHA256SUMS.txt`

Windows 10/11 x64 対応です。EXE をダウンロードしてそのまま実行でき、Node.js、Python、追加の AI 実行環境は必要ありません。Authenticode 署名はなく、Windows SmartScreen に「不明な発行元」と表示される場合があります。

### 主な機能

- 本番前のローカルライブラリ分析。ID3 / Vorbis タグ、Apple / Deezer 情報、曲全体のローカル AI、手動ジャンル設定に対応します。
- [VJVision](https://github.com/ichiryu0021/VJVision) による指紋照合、音楽電量の証拠蓄積、候補確認。
- [Genre Police Visualizer](https://github.com/lbnandy/genre-police-visualizer) のビジュアル構成、背景、書体、配色、動き、トランジションを使用し、曲名、アーティスト、アートワークを表示します。歌詞は表示しません。
- 上下 / 左右レイアウト、文字表示、英字ナロー体、待機ビジュアル、ライブラリごとの DJ 名、中英日韓 UI に対応します。
- ウィンドウ、全画面、Spout、NDI、FPS 上限、自動レンダー品質、低負荷モード、ポータブルライブラリ管理に対応します。

### 既知の制限

Windows x64 のみ対応しています。本番前に、使用する音声デバイス、GPU、表示機器、Spout / NDI 受信側で確認してください。AutoVJ は DJ Master / Record 入力を聴くだけで音声を再生しません。MIDI / OSC、録画、仮想カメラ、SRT、RTMP、SMPTE ST 2110、自動ライブラリ統合は対象外です。

[詳しい説明](https://github.com/lbnandy/genre-police-autovj/blob/main/README.ja.md) · [プライバシー](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [既知の制限](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [問題を報告](https://github.com/lbnandy/genre-police-autovj/issues)
