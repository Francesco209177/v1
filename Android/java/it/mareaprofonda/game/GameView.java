package it.mareaprofonda.game;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;

import java.nio.ByteBuffer;
import java.util.ArrayList;

/**
 * Lo schermo del gioco. Un thread dedicato fa avanzare il gioco (scritto in Swift), ne copia le due
 * tele (mondo e interfaccia) in due Bitmap e le ingrandisce sullo schermo a multipli interi, senza
 * sfumature: ogni pixel d'arte resta un quadrato netto.
 *
 * Tocchi e tasti arrivano dal thread dell'interfaccia e vengono messi in coda: è il thread di gioco
 * a consegnarli, così il codice nativo è usato da un solo thread.
 */
final class GameView extends SurfaceView implements SurfaceHolder.Callback, Runnable {
    interface Host {
        void onQuitRequested();
        void onSmokeFinished();
    }

    private static final String TAG = "MareaProfonda";

    private final Host host;
    private final String assetsPath;
    private final String savesPath;
    private final String smokePath;
    private final Vibrator vibrator;
    private final Paint paint = new Paint();
    private final AudioPump audio = new AudioPump();

    private Thread thread;
    private volatile boolean running;
    private boolean booted;
    private boolean smokeReported;

    // Coda dei tocchi: quattro numeri per evento (id, fase, x, y).
    private final ArrayList<float[]> touches = new ArrayList<>();
    private final Object lock = new Object();
    private boolean backQueued;
    private int surfaceWidth;
    private int surfaceHeight;
    private boolean sizeChanged;
    private int insetLeft, insetTop, insetRight, insetBottom;

    // Controller.
    private boolean padSeen;
    private float padLX, padLY, padRX, padRY;
    private int padHatX, padHatY;
    private int padButtons;
    private boolean triggerL, triggerR;

    // Tele.
    private int layoutVersion = -1;
    private final Bitmap[] bitmaps = new Bitmap[2];
    private final ByteBuffer[] buffers = new ByteBuffer[2];
    private final Rect[] targets = { new Rect(), new Rect() };

    GameView(Context context, Host host, String assetsPath, String savesPath, String smokePath) {
        super(context);
        this.host = host;
        this.assetsPath = assetsPath;
        this.savesPath = savesPath;
        this.smokePath = smokePath;
        vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        paint.setFilterBitmap(false);
        paint.setAntiAlias(false);
        paint.setDither(false);
        getHolder().addCallback(this);
        setFocusable(true);
        setFocusableInTouchMode(true);
        setKeepScreenOn(true);
    }

    void setInsets(int left, int top, int right, int bottom) {
        synchronized (lock) {
            if (left != insetLeft || top != insetTop || right != insetRight || bottom != insetBottom) {
                insetLeft = left;
                insetTop = top;
                insetRight = right;
                insetBottom = bottom;
                sizeChanged = true;
            }
        }
    }

    // ---- Ciclo di vita -------------------------------------------------------------------------

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        if (Build.VERSION.SDK_INT >= 30) {
            // Il gioco è pensato per 60 fotogrammi al secondo: sugli schermi più veloci risparmia batteria.
            holder.getSurface().setFrameRate(60f, Surface.FRAME_RATE_COMPATIBILITY_DEFAULT);
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        synchronized (lock) {
            surfaceWidth = width;
            surfaceHeight = height;
            sizeChanged = true;
        }
        startLoop();
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        stopLoop();
    }

    void onHostResume() {
        if (getHolder().getSurface().isValid() && surfaceWidth > 0) startLoop();
    }

    void onHostPause() {
        stopLoop();
    }

    private void startLoop() {
        if (running) return;
        running = true;
        thread = new Thread(this, "marea-gioco");
        thread.start();
        audio.start();
    }

    private void stopLoop() {
        if (!running) return;
        running = false;
        audio.stop();
        Thread t = thread;
        thread = null;
        if (t != null) {
            try {
                t.join(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    // ---- Thread di gioco -----------------------------------------------------------------------

    @Override
    public void run() {
        long last = System.nanoTime();
        while (running) {
            int w, h, il, it, ir, ib;
            boolean resized;
            boolean back;
            float[][] events;
            synchronized (lock) {
                w = surfaceWidth;
                h = surfaceHeight;
                il = insetLeft;
                it = insetTop;
                ir = insetRight;
                ib = insetBottom;
                resized = sizeChanged;
                sizeChanged = false;
                back = backQueued;
                backQueued = false;
                events = touches.toArray(new float[0][]);
                touches.clear();
            }
            if (w <= 0 || h <= 0) {
                sleepQuietly(16);
                continue;
            }
            if (!booted) {
                Native.boot(assetsPath, savesPath, w, h, il, it, ir, ib);
                if (smokePath != null) Native.smokeStart(smokePath);
                booted = true;
                last = System.nanoTime();
            } else if (resized) {
                Native.resize(w, h, il, it, ir, ib);
            }
            for (float[] e : events) Native.touch((int) e[0], (int) e[1], e[2], e[3]);
            if (back) Native.back();
            float lx, ly, rx, ry;
            int hx, hy, mask;
            boolean seen;
            synchronized (lock) {
                lx = padLX;
                ly = padLY;
                rx = padRX;
                ry = padRY;
                hx = padHatX;
                hy = padHatY;
                mask = padButtons;
                if (triggerL) mask |= 1 << 6;
                if (triggerR) mask |= 1 << 7;
                seen = padSeen;
            }
            // Su Android l'asse verticale cresce verso il basso: il gioco lo vuole verso l'alto.
            Native.pad(seen, lx, -ly, rx, -ry, hx, -hy, mask);

            long now = System.nanoTime();
            double dt = (now - last) / 1e9;
            last = now;
            Native.frame(dt);

            draw();

            int buzz = Native.haptic();
            if (buzz != 0) vibrate(buzz);
            if (Native.quitRequested()) {
                post(host::onQuitRequested);
            }
            if (smokePath != null && !smokeReported && Native.smokeFinished()) {
                smokeReported = true;
                post(host::onSmokeFinished);
            }
        }
        if (booted) Native.pause();
    }

    private void draw() {
        int version = Native.layoutVersion();
        if (version != layoutVersion) {
            layoutVersion = version;
            for (int i = 0; i < 2; i++) {
                int lw = Native.layerWidth(i);
                int lh = Native.layerHeight(i);
                int scale = Native.layerScale(i);
                if (bitmaps[i] == null || bitmaps[i].getWidth() != lw || bitmaps[i].getHeight() != lh) {
                    if (bitmaps[i] != null) bitmaps[i].recycle();
                    bitmaps[i] = Bitmap.createBitmap(lw, lh, Bitmap.Config.ARGB_8888);
                }
                bitmaps[i].setHasAlpha(i == 1);
                buffers[i] = Native.layerBuffer(i);
                targets[i].set(0, 0, lw * scale, lh * scale);
            }
        }
        for (int i = 0; i < 2; i++) {
            buffers[i].rewind();
            bitmaps[i].copyPixelsFromBuffer(buffers[i]);
        }
        SurfaceHolder holder = getHolder();
        Canvas canvas = null;
        try {
            canvas = Build.VERSION.SDK_INT >= 26 ? holder.lockHardwareCanvas() : holder.lockCanvas();
            if (canvas == null) {
                sleepQuietly(8);
                return;
            }
            canvas.drawBitmap(bitmaps[0], null, targets[0], paint);
            canvas.drawBitmap(bitmaps[1], null, targets[1], paint);
        } catch (RuntimeException e) {
            // La superficie può sparire tra un fotogramma e l'altro (app in secondo piano).
            Log.w(TAG, "disegno saltato: " + e);
            sleepQuietly(8);
        } finally {
            if (canvas != null) {
                try {
                    holder.unlockCanvasAndPost(canvas);
                } catch (RuntimeException e) {
                    Log.w(TAG, "superficie non più valida: " + e);
                }
            }
        }
    }

    private static void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @SuppressWarnings("deprecation")
    private void vibrate(int kind) {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long millis;
        int strength;
        switch (kind) {
            case 1: millis = 10; strength = 60; break;
            case 2: millis = 18; strength = 130; break;
            case 3: millis = 36; strength = 255; break;
            case 4: millis = 26; strength = 170; break;
            default: millis = 60; strength = 200; break;
        }
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                vibrator.vibrate(VibrationEffect.createOneShot(millis, strength));
            } else {
                vibrator.vibrate(millis);
            }
        } catch (RuntimeException e) {
            Log.w(TAG, "vibrazione non disponibile: " + e);
        }
    }

    // ---- Tocchi --------------------------------------------------------------------------------

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        int action = event.getActionMasked();
        synchronized (lock) {
            switch (action) {
                case MotionEvent.ACTION_DOWN:
                case MotionEvent.ACTION_POINTER_DOWN: {
                    int i = event.getActionIndex();
                    touches.add(new float[] { event.getPointerId(i), 0, event.getX(i), event.getY(i) });
                    break;
                }
                case MotionEvent.ACTION_MOVE: {
                    for (int i = 0; i < event.getPointerCount(); i++) {
                        touches.add(new float[] { event.getPointerId(i), 1, event.getX(i), event.getY(i) });
                    }
                    break;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_POINTER_UP: {
                    int i = event.getActionIndex();
                    touches.add(new float[] { event.getPointerId(i), 2, event.getX(i), event.getY(i) });
                    break;
                }
                case MotionEvent.ACTION_CANCEL: {
                    for (int i = 0; i < event.getPointerCount(); i++) {
                        touches.add(new float[] { event.getPointerId(i), 3, event.getX(i), event.getY(i) });
                    }
                    break;
                }
                default:
                    break;
            }
        }
        return true;
    }

    void queueBack() {
        synchronized (lock) {
            backQueued = true;
        }
    }

    // ---- Controller ----------------------------------------------------------------------------

    private static boolean fromPad(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    /** Bit del tasto nell'ordine a, b, x, y, l1, r1, l2, r2, l3, r3, menu, opzioni; -1 se non è un tasto del gioco. */
    private static int buttonBit(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BUTTON_A: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_Y: return 3;
            case KeyEvent.KEYCODE_BUTTON_L1: return 4;
            case KeyEvent.KEYCODE_BUTTON_R1: return 5;
            case KeyEvent.KEYCODE_BUTTON_L2: return 6;
            case KeyEvent.KEYCODE_BUTTON_R2: return 7;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 8;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 9;
            case KeyEvent.KEYCODE_BUTTON_START: return 10;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return 11;
            default: return -1;
        }
    }

    /** @return true se il tasto è stato gestito. */
    boolean handleKey(KeyEvent event) {
        if (!fromPad(event.getSource())) return false;
        int code = event.getKeyCode();
        boolean down = event.getAction() == KeyEvent.ACTION_DOWN;
        synchronized (lock) {
            int bit = buttonBit(code);
            if (bit >= 0) {
                padSeen = true;
                if (down) padButtons |= 1 << bit; else padButtons &= ~(1 << bit);
                return true;
            }
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_LEFT: padSeen = true; padHatX = down ? -1 : 0; return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: padSeen = true; padHatX = down ? 1 : 0; return true;
                case KeyEvent.KEYCODE_DPAD_UP: padSeen = true; padHatY = down ? -1 : 0; return true;
                case KeyEvent.KEYCODE_DPAD_DOWN: padSeen = true; padHatY = down ? 1 : 0; return true;
                default: return false;
            }
        }
    }

    private static float axis(MotionEvent event, int axis) {
        InputDevice device = event.getDevice();
        float value = event.getAxisValue(axis);
        if (device == null) return value;
        InputDevice.MotionRange range = device.getMotionRange(axis, event.getSource());
        if (range != null && Math.abs(value) <= range.getFlat()) return 0f;
        return value;
    }

    /** @return true se il movimento è stato gestito. */
    boolean handleMotion(MotionEvent event) {
        if (!fromPad(event.getSource()) || event.getAction() != MotionEvent.ACTION_MOVE) return false;
        synchronized (lock) {
            padSeen = true;
            padLX = axis(event, MotionEvent.AXIS_X);
            padLY = axis(event, MotionEvent.AXIS_Y);
            padRX = axis(event, MotionEvent.AXIS_Z);
            padRY = axis(event, MotionEvent.AXIS_RZ);
            float hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X);
            float hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y);
            padHatX = hatX > 0.5f ? 1 : (hatX < -0.5f ? -1 : 0);
            padHatY = hatY > 0.5f ? 1 : (hatY < -0.5f ? -1 : 0);
            float left = Math.max(event.getAxisValue(MotionEvent.AXIS_LTRIGGER), event.getAxisValue(MotionEvent.AXIS_BRAKE));
            float right = Math.max(event.getAxisValue(MotionEvent.AXIS_RTRIGGER), event.getAxisValue(MotionEvent.AXIS_GAS));
            triggerL = left > 0.5f;
            triggerR = right > 0.5f;
        }
        return true;
    }
}
