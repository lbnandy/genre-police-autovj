# Genre Police AutoVJ 0.1.1 Beta

[简体中文](#简体中文) · [English](#english) · [日本語](#日本語)

## 简体中文

本次更新加入 Ableton Link 节拍同步、本地节拍识别和全屏冲击效果，并扩展 DJ 标识与画面布局控制。

### 下载

- `Genre-Police-AutoVJ-0.1.1-portable.exe`
- `SHA256SUMS.txt`
- `BUILD-INFO.json`

适用于 Windows 10/11 x64。下载 EXE 后直接运行，无需安装 Node.js、Python、Carabiner 或额外下载节拍模型。版本未进行 Authenticode 代码签名，Windows SmartScreen 可能显示“无法识别的发布者”。

### 本次更新

- **节拍同步**：新增自动、音频识别和 Ableton Link 三种来源。自动模式优先使用有效 Link peer，断开后回退到音频识别；Link 组件随软件提供，支持自动发现与重连。
- **本地节拍识别**：更新内置节拍模型，加入针对 EDM 的节拍边界修正和静音处理。
- **冲击控制**：可选择音乐响应或节拍驱动；节拍驱动支持固定强度、随音乐变化两种方式。新增五档冲击效果强度和三档可视化大小。
- **全屏冲击**：加入随冲击触发的画面缩放、扭曲、短暂闪光和 RGB 分离，可在现场演出页或按 `X` 开关；左上角品牌文字保持位置固定。
- **DJ 标识与布局**：每套曲库可保存 DJ Logo 和自定义封面，支持 Logo 大小调整、封面裁剪及随曲风变化的 Logo 动效。可分别隐藏标题、曲目信息、封面与品牌标识；隐藏曲目信息后自动调整画面布局。
- **界面与默认设置**：整理准备音乐、设置和当前视觉的信息层级与控件布局。新曲库默认使用节拍驱动、随音乐变化的节拍强度，已有设置继续保留。

### 使用提示

使用 Ableton Link 时，仍需在其他软件中开启 Link，并保持 DJ Master / Record 音频输入。Link 同步节拍，不提供曲名或播放进度。节拍识别仍可能漏拍或多拍；本版继续作为 Beta 提供，请在演出前测试音频路由、同步与输出设备。

[完整说明](https://github.com/lbnandy/genre-police-autovj/blob/main/README.md) · [隐私说明](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [已知限制](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [反馈问题](https://github.com/lbnandy/genre-police-autovj/issues)

## English

This update adds Ableton Link synchronization, local beat tracking, and screen-impact effects, with more control over DJ identity and visual layouts.

### Download

- `Genre-Police-AutoVJ-0.1.1-portable.exe`
- `SHA256SUMS.txt`
- `BUILD-INFO.json`

For Windows 10/11 x64. Download and run the EXE; no separate installation of Node.js, Python, Carabiner, or beat models is required. The build is not Authenticode-signed, so Windows SmartScreen may show an “Unknown publisher” warning.

### What's new

- **Beat synchronization:** Choose Auto, Audio detection, or Ableton Link. Auto uses a valid Link peer when available and falls back to audio detection when disconnected. The bundled Link component supports automatic discovery and reconnection.
- **Local beat tracking:** Updated the bundled beat model, with an EDM beat-boundary correction and silence handling.
- **Impact controls:** Choose Music response or Beat-driven mode. Beat-driven mode offers fixed or music-dependent beat strength. Five impact-effect levels and three visual sizes are now available.
- **Screen impact:** Add impact-triggered zoom, distortion, brief flashes, and RGB separation. Toggle it on the Live page or with `X`; the branding in the upper-left corner stays in place.
- **DJ identity and layout:** Save a DJ logo and custom artwork per library, with logo sizing, artwork cropping, and genre-dependent logo animation. Hide the heading, track information, artwork, and branding independently; the layout adjusts when track information is hidden.
- **Interface and defaults:** Reorganized information and controls in Prepare, Settings, and Current visual. New libraries default to Beat-driven mode with music-dependent beat strength; existing settings are retained.

### Usage notes

Enable Link in the other application and keep the DJ Master / Record audio input connected. Link synchronizes beats; it does not provide track names or playback position. Audio beat tracking can still miss or add beats. This remains a Beta release: test audio routing, synchronization, and output devices before a show.

[Full README](https://github.com/lbnandy/genre-police-autovj/blob/main/README.en.md) · [Privacy](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [Known limitations](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [Report an issue](https://github.com/lbnandy/genre-police-autovj/issues)

## 日本語

Ableton Link による拍同期、ローカル拍認識、画面全体のインパクト効果を追加し、DJ ロゴやレイアウトの調整機能を拡充しました。

### ダウンロード

- `Genre-Police-AutoVJ-0.1.1-portable.exe`
- `SHA256SUMS.txt`
- `BUILD-INFO.json`

Windows 10/11 x64 対応です。EXE をダウンロードしてそのまま実行できます。Node.js、Python、Carabiner の別途インストールや、拍認識モデルの追加ダウンロードは不要です。Authenticode 署名はなく、Windows SmartScreen に「不明な発行元」と表示される場合があります。

### 更新内容

- **拍同期**：自動・音声検出・Ableton Link の3種類から選択できます。自動では有効な Link ピアを優先し、切断時は音声検出に戻ります。Link コンポーネントを同梱し、自動検出と再接続に対応しました。
- **ローカル拍認識**：内蔵の拍認識モデルを更新し、EDM 向けの拍境界補正と無音処理を追加しました。
- **インパクト調整**：音楽応答と拍駆動を選択でき、拍駆動では強度を固定するか、音楽に合わせて変化させるかを選べます。インパクト効果の強度を5段階、ビジュアルのサイズを3段階で調整できます。
- **画面インパクト**：インパクトに合わせたズーム、歪み、短いフラッシュ、RGB 分離を追加しました。ライブ画面または `X` キーで切り替えられ、左上のブランド表示は位置を保ちます。
- **DJ プロフィールとレイアウト**：ライブラリごとに DJ ロゴとカスタムアートワークを保存できます。ロゴのサイズ調整、アートワークのトリミング、ジャンルに連動したロゴアニメーションに対応しました。見出し、楽曲情報、アートワーク、ブランド表示を個別に非表示にでき、楽曲情報を隠すとレイアウトが自動調整されます。
- **画面構成と初期設定**：楽曲準備・設定・現在のビジュアルの情報階層と操作項目を整理しました。新規ライブラリは拍駆動と音楽に応じた拍強度が初期設定になり、既存の設定は引き継がれます。

### 利用上の注意

連携先のソフトでも Link を有効にし、DJ Master / Record の音声入力を接続してください。Link は拍を同期しますが、曲名や再生位置は取得しません。音声による拍認識には、拍の取りこぼしや余分な検出が生じる場合があります。引き続き Beta 版のため、本番前に音声ルーティング、同期、出力機器を確認してください。

[詳しい説明](https://github.com/lbnandy/genre-police-autovj/blob/main/README.ja.md) · [プライバシー](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/PRIVACY.md) · [既知の制限](https://github.com/lbnandy/genre-police-autovj/blob/main/docs/KNOWN_ISSUES.md) · [不具合報告](https://github.com/lbnandy/genre-police-autovj/issues)
