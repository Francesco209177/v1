package it.mareaprofonda.game;

import android.app.Activity;
import android.content.res.AssetManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.DisplayCutout;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Unica schermata dell'app: prepara le risorse, apre lo schermo di gioco a tutto schermo
 * e gli passa tasti e movimenti del controller. Il gioco vero è nella libreria nativa.
 */
public final class MainActivity extends Activity implements GameView.Host {
    private static final String TAG = "MareaProfonda";
    /** Cambia a ogni versione: le risorse vengono ricopiate quando non corrisponde. */
    private static final String ASSETS_MARK = "risorse-v" + BuildInfo.VERSION_CODE;

    private GameView view;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            // Il gioco arriva fin sotto la tacca; i comandi restano nell'area sicura.
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(params);
        }

        File assets = new File(getFilesDir(), "risorse");
        if (!prepareAssets(assets)) {
            Log.e(TAG, "risorse non copiate: il gioco non può partire");
        }
        File saves = new File(getFilesDir(), "partite");
        if (!saves.isDirectory() && !saves.mkdirs()) {
            Log.w(TAG, "cartella dei salvataggi non creata");
        }

        // Prova automatica: `adb shell am start -n it.mareaprofonda.game/.MainActivity --ez smoke true`.
        String smoke = null;
        if (getIntent() != null && getIntent().getBooleanExtra("smoke", false)) {
            File base = getExternalFilesDir(null);
            File directory = new File(base != null ? base : getFilesDir(), "smoke");
            deleteTree(directory);
            if (directory.mkdirs() || directory.isDirectory()) smoke = directory.getAbsolutePath();
        }

        view = new GameView(this, this, assets.getAbsolutePath(), saves.getAbsolutePath(), smoke);
        setContentView(view);
        view.setOnApplyWindowInsetsListener((v, insets) -> {
            applyInsets(insets);
            return insets;
        });
        hideSystemBars();
    }

    private void applyInsets(WindowInsets insets) {
        if (Build.VERSION.SDK_INT < 28) return;
        DisplayCutout cutout = insets.getDisplayCutout();
        if (cutout == null) {
            view.setInsets(0, 0, 0, 0);
        } else {
            view.setInsets(cutout.getSafeInsetLeft(), cutout.getSafeInsetTop(), cutout.getSafeInsetRight(), cutout.getSafeInsetBottom());
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        view.onHostResume();
    }

    @Override
    protected void onPause() {
        view.onHostPause();
        super.onPause();
    }

    // ---- Tasti ---------------------------------------------------------------------------------

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (view.handleKey(event)) return true;
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) view.queueBack();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (view.handleMotion(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }

    // ---- Richieste del gioco -------------------------------------------------------------------

    @Override
    public void onQuitRequested() {
        // "Indietro" dal titolo: l'app va in secondo piano, come ci si aspetta su Android.
        moveTaskToBack(true);
    }

    @Override
    public void onSmokeFinished() {
        finish();
    }

    // ---- Risorse -------------------------------------------------------------------------------

    /** Copia `Data` e `Sprites` dall'APK a una cartella normale: il gioco li legge come file. */
    private boolean prepareAssets(File target) {
        File mark = new File(target, ASSETS_MARK);
        if (mark.exists()) return true;
        deleteTree(target);
        try {
            copyFolder(getAssets(), "Data", new File(target, "Data"));
            copyFolder(getAssets(), "Sprites", new File(target, "Sprites"));
            return mark.createNewFile() || mark.exists();
        } catch (IOException e) {
            Log.e(TAG, "copia delle risorse fallita", e);
            return false;
        }
    }

    private static void copyFolder(AssetManager manager, String name, File target) throws IOException {
        String[] files = manager.list(name);
        if (files == null || files.length == 0) throw new IOException("cartella vuota nell'APK: " + name);
        if (!target.isDirectory() && !target.mkdirs()) throw new IOException("impossibile creare " + target);
        byte[] chunk = new byte[16384];
        for (String file : files) {
            try (InputStream in = manager.open(name + "/" + file);
                 OutputStream out = new FileOutputStream(new File(target, file))) {
                int n;
                while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
            }
        }
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteTree(child);
        }
        if (file.exists() && !file.delete()) {
            Log.w(TAG, "non eliminato: " + file);
        }
    }
}
