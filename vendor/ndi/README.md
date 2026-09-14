# NDI SDK headers

NDI SDK 6.3.2.0, downloaded from the official Windows SDK on 2026-09-14.
Each header retains its individual MIT notice. The NDI runtime is proprietary;
it is not covered by those header licenses or AutoVJ's MIT license.

`scripts/prepare-video.ps1` obtains and verifies the runtime separately. It is
loaded from `native/bin/Processing.NDI.Lib.x64.dll`, never the system PATH.
Only this redistributable DLL is included; no NDI Tools, examples, discovery
server or Advanced trial binaries are distributed.

- SDK: https://ndi.video/for-developers/ndi-sdk/
- SDK archive SHA-256: `4d5dd36a1c7c7634f408bf459b068787cce6f5310a3efe832d76b1ddeb54e499`
- Runtime SHA-256: `2b6602075868ba4401f82f417d72424805d69b11ca86078023d0d489ff45dd84`
- Runtime licenses: `assets/licenses/Processing.NDI.Lib.Licenses.txt`
- SDK terms: `assets/licenses/NDI-SDK-License-Agreement.pdf`
- End-user runtime terms: `assets/licenses/NDI-RUNTIME-TERMS.txt`

NDI® is a registered trademark of Vizrt NDI AB.
