# Privacy / 隐私说明

Genre Police AutoVJ is designed for local DJ preparation and live visual output. It contains no advertising SDK, account system, usage analytics or automatic crash uploader.

Genre Police AutoVJ 面向本地曲库准备和现场视觉输出，不包含广告 SDK、账号系统、使用统计或自动崩溃上传。

## Data processed locally / 本机处理的数据

- Audio from the selected DJ Master / Record endpoint is processed on the computer for fingerprint matching, Music Battery evidence, spectrum/rhythm response and whole-track local AI analysis. Audio is not uploaded.
- Library metadata, manual genre choices, DJ name, analysis evidence, artwork and output preferences are stored in the current Windows user's application-data directory. The application does not write source audio into a library pack.
- Diagnostics are written only when the user explicitly chooses **Export diagnostics**. The report contains app/system, input, output and recent performance state; it is not uploaded automatically.

- 选定的 DJ Master / Record 输入音频只在本机用于指纹匹配、音乐电量证据、频谱/节奏响应和整曲本地 AI 分析，不会上传。
- 曲库元数据、手动曲风、DJ 名字、分析证据、封面和输出偏好保存在当前 Windows 用户的应用数据目录。曲库包不会写入原始音频。
- 只有用户主动选择**导出诊断报告**时才会写入诊断文件；报告包含应用/系统、输入、输出和近期性能状态，不会自动上传。

## Optional network requests / 可选联网请求

When **Online genre lookup** is enabled during preparation, the app may send title, artist, album and duration metadata to Apple Music catalog and Deezer. The request does not include audio. Mainland China networks use Apple China first and skip Deezer; other or unknown regions use Apple US and Deezer. The region probe reads and caches only a country code.

准备阶段开启**在线曲风查询**后，软件可能向 Apple Music 目录和 Deezer 发送曲名、艺术家、专辑和时长等元数据，不会发送音频。中国大陆网络优先使用 Apple 中国区并跳过 Deezer，其他或未知地区使用 Apple 美国区和 Deezer；地区探测只读取并缓存国家代码。

The app checks this project's public GitHub Releases list after startup and at most once every 24 hours. The request contains no track metadata, audio, library contents or settings; network failures are silent.

软件会在启动后检查本项目公开的 GitHub Releases，且每 24 小时最多自动检查一次。请求不包含曲目元数据、音频、曲库内容或设置；联网失败时不会打扰用户。

## Ableton Link (optional) / Ableton Link（可选）

Auto (the default) or Ableton Link automatically starts the bundled Carabiner component and connects over 127.0.0.1:17000 (or uses a component already running locally). The component uses the local network for Link discovery and timing synchronization. AutoVJ requests timing status only; it does not send audio, track metadata or library contents through Link or change the shared tempo or transport. Switching to audio detection stops AutoVJ timing queries. Once started, the component continues Link discovery until AutoVJ exits, allowing reliable source switching; AutoVJ then closes the component process it started.

默认的自动模式或选择 Ableton Link 后，软件自动启动内置的 Carabiner 组件，通过 127.0.0.1:17000 连接，也可使用本机已经运行的组件。组件在局域网中发现 Link 参与者并同步节奏。AutoVJ 只请求时序状态，不通过此连接发送音频、曲目信息或曲库内容，也不改变共享速度或播放状态。切回音频识别时，AutoVJ 停止读取同步信息。已启动的组件会继续参与 Link 发现，供后续切换复用；退出 AutoVJ 时会关闭由它启动的组件进程。

## Local files / 本地文件

The default data directory is `%APPDATA%/Genre Police AutoVJ`. Set `AUTOVJ_DATA_DIR` only when an isolated local data directory is needed for development or testing. Removing the application-data directory removes local settings, libraries and caches.

默认数据目录为 `%APPDATA%/Genre Police AutoVJ`。只有需要开发或测试隔离数据目录时才设置 `AUTOVJ_DATA_DIR`。删除应用数据目录会移除本地设置、曲库和缓存。

Library export omits source paths, machine audio-device settings and local lookup caches. Import creates an independent local library and does not modify the original audio files.

曲库导出不会包含源文件路径、机器音频设备设置和本地查询缓存。导入会创建独立的本地曲库，不会修改原始音频文件。
