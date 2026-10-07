# Genre Police AutoVJ 0.1.2 Beta

[简体中文](#简体中文) · [English](#english) · [日本語](#日本語)

## 简体中文

本次更新加入单曲与批量视频导出，并整理「准备音乐」页，让曲库素材和常用操作更容易找到。

### 下载

- `Genre-Police-AutoVJ-0.1.2-portable.exe`
- `SHA256SUMS.txt`
- `BUILD-INFO.json`

适用于 Windows 10/11 x64。下载 EXE 后直接运行，无需另外安装 Node.js、Python 或 FFmpeg。版本未进行 Authenticode 代码签名，Windows SmartScreen 可能显示“无法识别的发布者”。

### 本次更新

- **视频导出**：将本地曲目渲染为含音频的 MP4。支持片段预览、横屏／竖屏／方形、720p／1080p、30／60 FPS，以及低／中／高三档视频质量。导出视觉设置独立保存，不影响现场设置。
- **批量导出**：勾选多首曲目，使用统一设置依次导出；可收起窗口查看其他页面，再返回导出任务。支持取消、逐曲结果和同名文件自动编号。
- **准备音乐页**：直接展示 DJ 名字、Logo 和自定义封面；曲目旁新增导出入口，批量操作固定在列表上方，重命名移到曲库选择旁。
- **导出体验**：优先使用可用的硬件编码，提供软件兼容模式；移除视频开头的加载过渡，导出时暂停片段播放，分别显示近期与平均渲染速度。

### 使用提示

导出需要原始音频文件，曲库包不包含音频。导出在本机完成，可能慢于实时；复杂视觉效果和高分辨率会增加耗时。此功能是离线视频导出，不是现场录制。已有曲库和设置继续保留，本版仍作为 Beta 提供。

[完整说明](https://github.com/lbnandy/genre-police-autovj/blob/main/README.md) · [隐私说明](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [已知限制](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [反馈问题](https://github.com/lbnandy/genre-police-autovj/issues)

## English

This update adds single-track and batch video export, and reorganizes Prepare to make library assets and common actions easier to find.

### Download

- `Genre-Police-AutoVJ-0.1.2-portable.exe`
- `SHA256SUMS.txt`
- `BUILD-INFO.json`

For Windows 10/11 x64. Download and run the EXE; no separate installation of Node.js, Python, or FFmpeg is required. The build is not Authenticode-signed, so Windows SmartScreen may show an “Unknown publisher” warning.

### What's new

- **Video export:** Render local tracks to MP4 with audio. Includes clip previews, landscape/portrait/square formats, 720p/1080p, 30/60 FPS, and low/medium/high video quality. Export visual settings are saved separately from live settings.
- **Batch export:** Select several tracks and export them sequentially with shared settings. Close the dialog to use other pages and return through Export tasks. Supports cancellation, per-track results, and automatic numbering for duplicate filenames.
- **Prepare page:** DJ name, logo, and custom artwork are directly visible. Video export is available beside each track, batch actions stay above the list, and Rename sits beside the library selector.
- **Export experience:** Prefers available hardware encoding, with a software compatibility option. Skips startup transitions, pauses clip playback during export, and shows recent and average rendering speeds separately.

### Usage notes

Export requires the original audio files; library packs do not contain audio. Processing stays local and can take longer than real time, especially with complex visuals or high resolutions. This is offline video export, not live recording. Existing libraries and settings are retained. This remains a Beta release.

[Full README](https://github.com/lbnandy/genre-police-autovj/blob/main/README.en.md) · [Privacy](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [Known limitations](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [Report an issue](https://github.com/lbnandy/genre-police-autovj/issues)

## 日本語

単曲・複数曲の動画書き出しを追加しました。「楽曲準備」画面も整理し、ライブラリの素材やよく使う操作を見つけやすくしました。

### ダウンロード

- `Genre-Police-AutoVJ-0.1.2-portable.exe`
- `SHA256SUMS.txt`
- `BUILD-INFO.json`

Windows 10/11 x64 対応です。EXE をダウンロードしてそのまま実行できます。Node.js、Python、FFmpeg の別途インストールは不要です。Authenticode 署名はなく、Windows SmartScreen に「不明な発行元」と表示される場合があります。

### 更新内容

- **動画の書き出し**：ローカルの楽曲から音声付き MP4 を生成できます。短いプレビュー、横長／縦長／正方形、720p／1080p、30／60 FPS、低／中／高の動画品質に対応します。書き出し用のビジュアル設定はライブ設定とは別に保存されます。
- **一括書き出し**：複数曲を選択し、共通の設定で順番に書き出せます。ダイアログを閉じて別の画面を使い、書き出しタスクから戻れます。キャンセル、曲ごとの結果表示、同名ファイルの自動連番に対応します。
- **楽曲準備画面**：DJ 名・ロゴ・カスタムアートワークを直接表示します。各曲の横に書き出しボタンを配置し、一括操作をリスト上部に、名前の変更をライブラリ選択の横にまとめました。
- **書き出し時の動作**：利用可能なハードウェアエンコードを優先し、ソフトウェア互換モードも用意しました。冒頭の読み込みトランジションを省き、書き出し中はプレビュー再生を停止します。直近と平均のレンダリング速度を分けて表示します。

### 利用上の注意

書き出しには元の音声ファイルが必要です。ライブラリパックに音声は含まれません。処理は端末内で完結しますが、複雑なビジュアルや高解像度では実時間より長くかかる場合があります。ライブ録画ではなく、オフラインの動画書き出し機能です。既存のライブラリと設定は引き継がれます。引き続き Beta 版として提供します。

[詳しい説明](https://github.com/lbnandy/genre-police-autovj/blob/main/README.ja.md) · [プライバシー](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [既知の制限](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [問題を報告](https://github.com/lbnandy/genre-police-autovj/issues)
