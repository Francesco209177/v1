package it.mareaprofonda.game;

import java.nio.ByteBuffer;

/**
 * Le funzioni del gioco, scritte in Swift e raggiunte attraverso il ponte JNI
 * (Portable/CJNI/marea_jni.c). Tutte, tranne {@link #audio}, vanno chiamate dal thread di gioco.
 */
final class Native {
    private Native() {}

    static {
        // La libreria del C++ serve al runtime di Swift: va caricata per prima.
        System.loadLibrary("c++_shared");
        System.loadLibrary("MareaProfonda");
    }

    static native void boot(String assets, String saves, int width, int height, int left, int top, int right, int bottom);
    static native void resize(int width, int height, int left, int top, int right, int bottom);
    static native void frame(double dt);

    /** Cambia quando le tele sono state ricreate: vanno richiesti di nuovo buffer e misure. */
    static native int layoutVersion();
    /** Pixel della tela (0 = mondo, 1 = interfaccia), RGBA premoltiplicato. */
    static native ByteBuffer layerBuffer(int index);
    static native int layerWidth(int index);
    static native int layerHeight(int index);
    static native int layerScale(int index);

    /** phase: 0 giù, 1 mosso, 2 su, 3 annullato. Coordinate in pixel dello schermo. */
    static native void touch(int id, int phase, float x, float y);
    static native void pad(boolean connected, float lx, float ly, float rx, float ry, int dpadX, int dpadY, int buttons);
    static native void back();

    /** Vibrazione chiesta dall'ultimo fotogramma: 0 nessuna, da 1 (leggera) a 5 (avviso). */
    static native int haptic();
    static native boolean quitRequested();

    /** Riempie il buffer con audio mono a 16 bit, 22.050 Hz. Chiamata dal thread dell'audio. */
    static native void audio(short[] buffer, int frames);
    static native void pause();

    static native void smokeStart(String directory);
    static native boolean smokeFinished();
}
