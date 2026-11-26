#!/usr/bin/env bash
# Prova di avvio nell'emulatore Android: installa l'APK, avvia l'app in modalità di prova automatica
# (percorre tutte le schermate da sola) e aspetta la riga "SMOKE OK" nel registro.
# Uso: Tools/ci/smoke-android.sh percorso/MareaProfonda-x86_64.apk
set -u
APK="$1"
OUT="smoke-android"
PACKAGE="it.mareaprofonda.game"
LIMIT_SECONDS="${LIMIT_SECONDS:-420}"
mkdir -p "$OUT"

adb install -r "$APK" || { echo "::error::installazione fallita"; exit 1; }
adb logcat -c
adb shell am start -n "$PACKAGE/.MainActivity" --ez smoke true || { echo "::error::avvio fallito"; exit 1; }

ok=0
elapsed=0
shot=0
while [ "$elapsed" -lt "$LIMIT_SECONDS" ]; do
    sleep 3
    elapsed=$((elapsed + 3))
    adb logcat -d -s MareaProfonda:V > "$OUT/app.log" 2>/dev/null
    if grep -q "SMOKE OK" "$OUT/app.log"; then ok=1; break; fi
    # Due fotografie dello schermo vero dell'emulatore: provano che il gioco arriva davvero a video.
    if [ "$shot" -lt 2 ] && [ "$elapsed" -ge $((9 + shot * 12)) ]; then
        adb exec-out screencap -p > "$OUT/schermo_$shot.png" 2>/dev/null
        shot=$((shot + 1))
    fi
    if adb logcat -d -b crash 2>/dev/null | grep -q "$PACKAGE"; then
        echo "::error::l'app è andata in crash"
        break
    fi
done

adb logcat -d > "$OUT/logcat.txt" 2>/dev/null
adb logcat -d -b crash > "$OUT/crash.txt" 2>/dev/null
adb pull "/sdcard/Android/data/$PACKAGE/files/smoke" "$OUT/istantanee" > /dev/null 2>&1 || echo "istantanee non recuperate"
grep -E "SMOKE|SPRITE|DATI" "$OUT/app.log" | tail -n 80
if [ "$ok" != "1" ]; then
    echo "::error::la prova non è arrivata in fondo in $LIMIT_SECONDS secondi"
    tail -n 60 "$OUT/crash.txt"
    exit 1
fi
if grep -qE "SMOKE.*(SENZA ISTANTANEA)|^.*SPRITE |^.*DATI " "$OUT/app.log"; then
    echo "::error::la prova segnala problemi (sprite, dati o istantanee mancanti)"
    exit 1
fi
echo "Prova nell'emulatore riuscita."
