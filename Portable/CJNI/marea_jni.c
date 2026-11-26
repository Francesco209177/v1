// Ponte JNI tra il guscio Android (classe it.mareaprofonda.game.Native) e il gioco scritto in Swift.
// Qui non c'è logica: ogni funzione traduce gli argomenti di Java e chiama la corrispondente `marea_*`.
#include "marea_jni.h"

#ifdef __ANDROID__

#include <jni.h>
#include <android/log.h>

#define NATIVE(name) Java_it_mareaprofonda_game_Native_##name

static void log_to_android(const char *text) {
    __android_log_write(ANDROID_LOG_INFO, "MareaProfonda", text);
}

JNIEXPORT void JNICALL NATIVE(boot)(JNIEnv *env, jclass cls, jstring assets, jstring saves, jint width, jint height,
                                    jint left, jint top, jint right, jint bottom) {
    (void)cls;
    marea_set_log(log_to_android);
    const char *assets_path = (*env)->GetStringUTFChars(env, assets, NULL);
    const char *saves_path = (*env)->GetStringUTFChars(env, saves, NULL);
    if (assets_path != NULL && saves_path != NULL) {
        marea_boot(assets_path, saves_path, width, height, left, top, right, bottom);
    }
    if (assets_path != NULL) (*env)->ReleaseStringUTFChars(env, assets, assets_path);
    if (saves_path != NULL) (*env)->ReleaseStringUTFChars(env, saves, saves_path);
}

JNIEXPORT void JNICALL NATIVE(resize)(JNIEnv *env, jclass cls, jint width, jint height, jint left, jint top, jint right, jint bottom) {
    (void)env; (void)cls;
    marea_resize(width, height, left, top, right, bottom);
}

JNIEXPORT void JNICALL NATIVE(frame)(JNIEnv *env, jclass cls, jdouble dt) {
    (void)env; (void)cls;
    marea_frame(dt);
}

JNIEXPORT jint JNICALL NATIVE(layoutVersion)(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    return marea_layout_version();
}

// Vista diretta sui pixel di una tela: Java li copia nella sua Bitmap senza passaggi intermedi.
JNIEXPORT jobject JNICALL NATIVE(layerBuffer)(JNIEnv *env, jclass cls, jint index) {
    (void)cls;
    jlong bytes = (jlong)marea_layer_width(index) * (jlong)marea_layer_height(index) * 4;
    return (*env)->NewDirectByteBuffer(env, marea_layer_pixels(index), bytes);
}

JNIEXPORT jint JNICALL NATIVE(layerWidth)(JNIEnv *env, jclass cls, jint index) {
    (void)env; (void)cls;
    return marea_layer_width(index);
}

JNIEXPORT jint JNICALL NATIVE(layerHeight)(JNIEnv *env, jclass cls, jint index) {
    (void)env; (void)cls;
    return marea_layer_height(index);
}

JNIEXPORT jint JNICALL NATIVE(layerScale)(JNIEnv *env, jclass cls, jint index) {
    (void)env; (void)cls;
    return marea_layer_scale(index);
}

JNIEXPORT void JNICALL NATIVE(touch)(JNIEnv *env, jclass cls, jint id, jint phase, jfloat x, jfloat y) {
    (void)env; (void)cls;
    marea_touch(id, phase, x, y);
}

JNIEXPORT void JNICALL NATIVE(pad)(JNIEnv *env, jclass cls, jboolean connected, jfloat lx, jfloat ly, jfloat rx, jfloat ry,
                                   jint dpad_x, jint dpad_y, jint buttons) {
    (void)env; (void)cls;
    marea_pad(connected ? 1 : 0, lx, ly, rx, ry, dpad_x, dpad_y, buttons);
}

JNIEXPORT void JNICALL NATIVE(back)(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    marea_back();
}

JNIEXPORT jint JNICALL NATIVE(haptic)(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    return marea_haptic();
}

JNIEXPORT jboolean JNICALL NATIVE(quitRequested)(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    return marea_quit_requested() != 0 ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL NATIVE(audio)(JNIEnv *env, jclass cls, jshortArray buffer, jint frames) {
    (void)cls;
    jsize capacity = (*env)->GetArrayLength(env, buffer);
    if (frames > capacity) frames = capacity;
    if (frames <= 0) return;
    jshort *samples = (*env)->GetShortArrayElements(env, buffer, NULL);
    if (samples == NULL) return;
    marea_audio((int16_t *)samples, frames);
    (*env)->ReleaseShortArrayElements(env, buffer, samples, 0);
}

JNIEXPORT void JNICALL NATIVE(pause)(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    marea_pause();
}

JNIEXPORT void JNICALL NATIVE(smokeStart)(JNIEnv *env, jclass cls, jstring directory) {
    (void)cls;
    const char *path = (*env)->GetStringUTFChars(env, directory, NULL);
    if (path == NULL) return;
    marea_smoke_start(path);
    (*env)->ReleaseStringUTFChars(env, directory, path);
}

JNIEXPORT jboolean JNICALL NATIVE(smokeFinished)(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    return marea_smoke_finished() != 0 ? JNI_TRUE : JNI_FALSE;
}

#else

// Fuori da Android il ponte non serve: resta un simbolo solo perché il file non sia vuoto.
int marea_jni_unused = 0;

#endif
