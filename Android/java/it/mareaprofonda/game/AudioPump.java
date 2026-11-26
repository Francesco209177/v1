package it.mareaprofonda.game;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.util.Log;

/** Thread che chiede al gioco l'audio a piccoli blocchi e lo consegna all'altoparlante. */
final class AudioPump implements Runnable {
    private static final int SAMPLE_RATE = 22050;
    private static final int BLOCK = 512;

    private volatile boolean running;
    private Thread thread;

    void start() {
        if (running) return;
        running = true;
        thread = new Thread(this, "marea-audio");
        thread.setPriority(Thread.MAX_PRIORITY);
        thread.start();
    }

    void stop() {
        running = false;
        Thread t = thread;
        thread = null;
        if (t != null) {
            try {
                t.join(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    @Override
    public void run() {
        AudioTrack track = null;
        try {
            int minimum = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            int bytes = Math.max(minimum, BLOCK * 2 * 4);
            track = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setSampleRate(SAMPLE_RATE)
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setBufferSizeInBytes(bytes)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
            track.play();
            short[] block = new short[BLOCK];
            while (running) {
                Native.audio(block, BLOCK);
                int written = track.write(block, 0, BLOCK);
                if (written < 0) break;
            }
        } catch (RuntimeException e) {
            // Senza audio il gioco resta giocabile: si annota e si prosegue in silenzio.
            Log.w("MareaProfonda", "audio non disponibile: " + e);
        } finally {
            if (track != null) {
                try {
                    track.pause();
                    track.flush();
                } catch (RuntimeException ignored) {
                    // Il dispositivo audio può essere già stato tolto.
                }
                track.release();
            }
        }
    }
}
