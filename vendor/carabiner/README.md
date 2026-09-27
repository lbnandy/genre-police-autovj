# Carabiner 1.2.0 — AutoVJ build 1

AutoVJ builds this separate GPL program from the pinned upstream source plus `link-udp-receive.patch`. The patch restores asynchronous UDP reception after an error or empty datagram, including Windows WSAECONNRESET when a Link peer departs. Retries are delayed by 10 ms; cancellation and closed sockets are not retried. No tempo, transport, or discovery protocol changes are made.

`component.json` records upstream revisions and SHA-256 hashes. `carabiner-1.2.0-source.zip` contains the complete original source and recursive dependencies, including their licenses and CMake files. The adjacent patch is part of the corresponding source of this modified build. Copyright and license notices are preserved. Carabiner, Ableton Link and Mongoose use their included GPL terms; gflags uses BSD, and Asio the Boost Software License.

To rebuild on Windows with Git, CMake and Visual Studio 2022 C++ tools:

1. Extract `carabiner-1.2.0-source.zip`.
2. Inside the extracted `carabiner-1.2.0/link`, run `git init` and `git apply <absolute-path-to-link-udp-receive.patch>`.
3. From `carabiner-1.2.0`, run `cmake -S . -B build -G "Visual Studio 17 2022" -A x64`, then `cmake --build build --config Release`.
4. The executable is `build/bin/Release/Carabiner.exe`.

In AutoVJ's source tree, `npm run prepare:link` performs these steps and records the source, patch, recipe and output hashes in a local build receipt. Packaging verifies that receipt. This entire source/notice folder accompanies the executable under `resources/carabiner`.

Upstream: https://github.com/Deep-Symmetry/carabiner/tree/b7310b6e01443d90b24200318aee38e4313cd2a0

AutoVJ communicates with the independent executable over its local TCP protocol; Link is not linked into Electron. This modification does not imply endorsement by Ableton or Deep Symmetry.
