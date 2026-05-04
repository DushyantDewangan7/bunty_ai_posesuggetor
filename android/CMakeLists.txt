project(AIPoseSuggestorPosePlugin)
cmake_minimum_required(VERSION 3.22.1)

# Nitro Modules requires C++20 (e.g. std::unordered_map::contains is C++20).
# See ADR-001 G4.
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_VERBOSE_MAKEFILE ON)

# Declare the shared library. Name MUST match `androidCxxLibName` in nitro.json
# and the System.loadLibrary("...") call. The Nitrogen-generated
# +autolinking.cmake will append its own sources (HybridPoseLandmarkerSpec.cpp,
# JHybridPoseLandmarkerSpec.cpp, AIPoseSuggestorPosePluginOnLoad.cpp) and
# linkage (fbjni, ReactAndroid::jsi, NitroModules) to this target.
# cpp-adapter.cpp lives in :poseplugin's source tree (ADR-001 G13). Path is
# relative to CMAKE_CURRENT_SOURCE_DIR = android/.
add_library(${PROJECT_NAME} SHARED
    poseplugin/src/main/cpp/cpp-adapter.cpp
)

# Pull in Nitrogen-generated sources, includes, definitions, and link libraries.
# Path resolves: CMAKE_CURRENT_SOURCE_DIR = android/, so
# ../nitrogen/... = repo-root nitrogen/... (correct).
include(${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/AIPoseSuggestorPosePlugin+autolinking.cmake)

# Vision Camera v5 publishes a `VisionCamera` prefab that exports the C++
# HybridFrameSpec.hpp our generated PoseLandmarker spec includes. Nitrogen
# 0.35.6 emits the #include but NOT the corresponding find_package — we have
# to wire it manually here. Pattern copied from
# node_modules/react-native-vision-camera-worklets/android/CMakeLists.txt.
find_package(react-native-vision-camera REQUIRED)
target_link_libraries(${PROJECT_NAME} react-native-vision-camera::VisionCamera)
