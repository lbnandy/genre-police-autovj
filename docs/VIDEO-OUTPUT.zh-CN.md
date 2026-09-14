# 视频输出 · 0.1.0

AutoVJ 现在提供本地窗口／全屏、Spout 和 NDI® High Bandwidth 视频输出。
文字、DJ 名字、专辑图、曲风特效和切歌过渡都来自同一份完整画面。

## 使用

1. 在「现场演出 → 画面输出 → 发送设置」填写接收软件中要看到的输出源名称。
2. 选择发送分辨率和帧率。默认 **1920 × 1080、60 FPS**；支持 720p、1080p、1440p、4K、1080 × 1920 竖屏和 1920 × 1200，以及 25 / 30 / 50 / 60 FPS。
3. 返回「现场演出」，开启 Spout 或 NDI。两路可以同时开启，也可以分别关闭。
4. 同一电脑上的 Resolume 或支持 Spout 的 OBS 插件选择该 Spout 源；局域网内的 NDI 接收软件选择该 NDI 源。NDI 通过 SDK 的发现机制发布，不需要手填接收端 IP。

两路开关在每次启动时保持关闭，避免启动应用就向现场发送画面。
源名称和格式保存在本机，切换或导入 DJ 曲库不会改变它们。发送期间格式控件锁定，关闭两路发送后可以修改。

**「收起窗口」仅隐藏本地窗口，Spout 和 NDI 继续发送。「切黑」作用于所有输出。** 退出软件会停止所有发送。
发送分辨率不随控制台大小、Windows 缩放或本地输出窗口大小改变。本地显示比例不同的时候等比留边。

当前只发送 **SDR 视频，不发送音频**。音乐仍由 DJ 调音台或播控软件负责路由。
OBS 可以在接收视频后统一处理音频、录制、虚拟摄像头和推流；这些桥接功能目前由 OBS 配置。

## 状态与性能

- Spout 显示实际发送调用帧率；它没有可靠的接收人数接口，因此不会虚构「已连接」人数。
- NDI 无接收端时显示「等待接收」，接入后显示发送帧率。悬停状态可查看源名称、尺寸和接收数。
- 发送进程收到的画面中断超过约 1.5 秒时，继续发送黑帧并显示中断状态。
- 原生发送进程异常退出会尝试恢复，30 秒内最多 3 次；失败后可用「重新连接」。接收软件在断连期间如何保持画面取决于其自身设置。
- 开关 NDI 不会销毁已运行的 Spout 发送实例；开关 Spout 也不要求重新创建 NDI 实例。
- 控制台 GPU 预览最高 30 FPS；低负载模式为最高 15 FPS / 960 × 540。外部发送按自己的帧率运行，不受待机降帧设置影响。只有预览时，源渲染也跟随预览上限。
- 自动分辨率仍只调整可视化内部 Canvas 的精度，最终发送的帧尺寸保持固定，文字保留完整合成清晰度。
- 分别统计动画渲染、预览和发送速度。按固定时钟发送时，计算负载过高可能重复最近一帧；「发送 60 FPS」不代表动画始终生成 60 个不同画面。

首次建议使用 1080p60。4K 的网络带宽和 GPU／CPU 开销更大；NDI 建议使用合适的有线局域网。接收端需与本机网络、防火墙和发现配置相容；应用不擅自修改系统防火墙。

## 实现与同步上游

`renderer/stage.html` 是唯一的完整视觉渲染源，在 Electron 离屏 GPU 合成器中运行。`renderer/output.html` 只显示这一份 GPU 画面。控制台预览也通过 GPU 纹理接收，不再逐帧 `capturePage` / JPEG 编码。

Electron 主进程将共享纹理分发给本地呈现器，并将 Windows NT handle 交给独立的 C++ 发送进程。发送进程复制句柄、打开对应 D3D11 纹理，在 GPU 拷贝完成后确认；主进程此时才释放原始纹理。慢消费者最多保留一个待处理源帧，不积压视频队列。

Spout 在 GPU 内复制共享纹理。启用 NDI 时创建固定 GPU→CPU 回读缓冲；只有存在接收端时才读取。NDI 编码在发送进程内的独立线程运行，使用 SDK 异步帧接口和固定缓冲槽，较慢的编码不会让 GPU / Spout 线程同步等待。控制台和识曲进程不会承担编码工作。不同 GPU 的机器会尝试寻找能打开实际源纹理的显卡；不同显卡驱动和接收软件仍需实机验证。更完整的渲染边界见 [架构说明](ARCHITECTURE.md)。

保留了原版 VisualEngine、音频 DSP、主题和文字适配。同步 Genre Police Visualizer 时仍使用现有导入流程；无需把 Spout／NDI 逻辑合并进桌面可视化项目。Electron 版本固定为 43.4.1，因为 sharedTexture 仍是实验性 API。

## 构建与验证

`npm run build:native` 构建识曲进程和视频发送进程。首次构建从官方地址获取并校验 NDI 标准 SDK 的可再分发 DLL，保存在本项目内，不安装到系统目录。依赖摘要发生变化会停止构建，需先检查新版 SDK 与许可。

可运行 `node scripts/qa-video-send.cjs`，需要 Playwright（或通过 `AUTOVJ_PLAYWRIGHT` 指定其模块目录）。测试使用隔离曲库、独立 Spout／NDI 原生接收器，验证完整文字画面、隐藏文字、切黑、窗口收起、画面中断、进程恢复和竖屏。`--force-device-scale-factor=1.5` 用于验证 Windows 150% 缩放；`--formats` 增加 25 / 50 FPS、16:10 和 4K 双路发送验证。

已通过上述本机接收测试，包括 1080p60、4K30、竖屏 1080 × 1920、150% 缩放和打包后运行。UI 回归覆盖中英日韩、36 组页面／窗口尺寸和 8 轮全屏／收起切换。接收器读取实际视频帧，检查文字、尺寸和黑场；发送帧率另从原生发送时钟统计，不把接收器重复读取同一帧当成动画帧率。

本次验证设备：Windows、NVIDIA GeForce RTX 4070 Ti。本机接收验证不能替代跨电脑网络或现场视频矩阵的联调。虚拟摄像头驱动、软件内 SRT／RTMP 编码、ST 2110、MIDI 和录制尚未加入。

## 来源与许可

- [Spout 官方 SDK](https://github.com/leadedge/Spout2)：BSD-2-Clause，固定版本与许可证见 `vendor/spout`。
- [NDI 官方 SDK](https://ndi.video/for-developers/ndi-sdk/)：标准版 6.3.2，使用 High Bandwidth 视频发送。
- [Electron 离屏渲染](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)及[共享纹理接口](https://www.electronjs.org/docs/latest/api/shared-texture)。
- [NDI 许可与再分发说明](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing)。DLL 的许可、第三方声明和最终用户条款在应用随附的 `licenses` 目录；源代码内为 `assets/licenses`。

NDI® is a registered trademark of Vizrt NDI AB.
