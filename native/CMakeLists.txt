cmake_minimum_required(VERSION 3.21)
project(GenrePoliceAutoVJ LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(VJ ${CMAKE_CURRENT_SOURCE_DIR}/../vendor/vjvision)
add_library(vj_sqlite STATIC ${VJ}/third_party/sqlite3_extract/sqlite-amalgamation-3490100/sqlite3.c)
target_compile_definitions(vj_sqlite PRIVATE SQLITE_THREADSAFE=1 SQLITE_OMIT_LOAD_EXTENSION)
add_executable(autovj-recognizer recognizer.cpp capture.cpp
  ${VJ}/src/fp/stft.cpp ${VJ}/src/fp/peaks.cpp ${VJ}/src/fp/hashing.cpp
  ${VJ}/src/fp/fp_db.cpp ${VJ}/src/fp/align.cpp ${VJ}/src/engine/charge_engine.cpp
  ${VJ}/src/util/audio_file.cpp ${VJ}/src/util/tags.cpp ${VJ}/third_party/pffft/pffft.cpp)
target_include_directories(autovj-recognizer PRIVATE ${VJ}/src ${VJ}/src/audio
 ${VJ}/third_party/pffft ${VJ}/third_party/sqlite3_extract/sqlite-amalgamation-3490100)
target_compile_definitions(autovj-recognizer PRIVATE NOMINMAX _CRT_SECURE_NO_WARNINGS)
target_compile_options(autovj-recognizer PRIVATE /utf-8 /EHsc /W3)
target_link_libraries(autovj-recognizer PRIVATE vj_sqlite ole32 shell32 mfplat mfreadwrite mfuuid propsys)
set_target_properties(autovj-recognizer PROPERTIES RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_CURRENT_SOURCE_DIR}/bin)
# Statically link the MSVC runtime so the portable helper has no VC redistributable prerequisite.
set_property(TARGET autovj-recognizer vj_sqlite PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Minimal pinned Spout DirectX SDK; no OpenGL/example/tool binaries.
set(SPOUT ${CMAKE_CURRENT_SOURCE_DIR}/../vendor/spout)
add_library(autovj-spout STATIC ${SPOUT}/SpoutDX.cpp ${SPOUT}/SpoutCopy.cpp
  ${SPOUT}/SpoutDirectX.cpp ${SPOUT}/SpoutFrameCount.cpp ${SPOUT}/SpoutSenderNames.cpp
  ${SPOUT}/SpoutSharedMemory.cpp ${SPOUT}/SpoutUtils.cpp)
target_include_directories(autovj-spout PUBLIC ${SPOUT})
target_compile_definitions(autovj-spout PRIVATE SPOUT_BUILD_STATIC NOMINMAX _CRT_SECURE_NO_WARNINGS)
target_link_libraries(autovj-spout PUBLIC d3d11 dxgi d3d9 winmm version shlwapi)
add_executable(autovj-video-output video-output.cpp)
target_include_directories(autovj-video-output PRIVATE ../vendor/ndi/include)
target_compile_definitions(autovj-video-output PRIVATE NOMINMAX _CRT_SECURE_NO_WARNINGS)
target_compile_options(autovj-video-output PRIVATE /utf-8 /EHsc /W3)
target_link_libraries(autovj-video-output PRIVATE autovj-spout d3dcompiler)
set_target_properties(autovj-video-output PROPERTIES RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_CURRENT_SOURCE_DIR}/bin)
set_property(TARGET autovj-video-output autovj-spout PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_executable(autovj-video-probe video-probe.cpp)
target_include_directories(autovj-video-probe PRIVATE ../vendor/ndi/include)
target_compile_definitions(autovj-video-probe PRIVATE NOMINMAX _CRT_SECURE_NO_WARNINGS)
target_compile_options(autovj-video-probe PRIVATE /utf-8 /EHsc /W3)
target_link_libraries(autovj-video-probe PRIVATE autovj-spout)
set_target_properties(autovj-video-probe PROPERTIES RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_CURRENT_SOURCE_DIR}/build/qa)
set_property(TARGET autovj-video-probe PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
add_custom_command(TARGET autovj-video-probe POST_BUILD COMMAND ${CMAKE_COMMAND} -E copy_if_different
  ${CMAKE_CURRENT_SOURCE_DIR}/bin/Processing.NDI.Lib.x64.dll $<TARGET_FILE_DIR:autovj-video-probe>)

add_executable(autovj-fingerprint-probe fingerprint-probe.cpp
  ${VJ}/src/fp/stft.cpp ${VJ}/src/fp/peaks.cpp ${VJ}/src/fp/hashing.cpp ${VJ}/third_party/pffft/pffft.cpp)
target_include_directories(autovj-fingerprint-probe PRIVATE ${VJ}/src ${VJ}/third_party/pffft)
target_compile_definitions(autovj-fingerprint-probe PRIVATE NOMINMAX _CRT_SECURE_NO_WARNINGS)
target_compile_options(autovj-fingerprint-probe PRIVATE /utf-8 /EHsc /W3)
set_target_properties(autovj-fingerprint-probe PROPERTIES RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_CURRENT_SOURCE_DIR}/build/qa)
set_property(TARGET autovj-fingerprint-probe PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
