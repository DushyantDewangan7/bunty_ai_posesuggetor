#include <jni.h>
#include <fbjni/fbjni.h>

#include "AIPoseSuggestorPosePluginOnLoad.hpp"

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
    return facebook::jni::initialize(vm, [] {
        margelo::nitro::aiposesuggestor::poseplugin::registerAllNatives();
    });
}
