#!/bin/bash
# Prova di avvio nel simulatore: installa l'app, la lancia con -smoke, salva log e schermate
# e decide l'esito. Uso: smoke.sh percorso/MareaProfonda.app
set -uo pipefail

APP="${1:?percorso della .app mancante}"
BUNDLE_ID="${BUNDLE_ID:-it.mareaprofonda.game}"
OUT="smoke-out"
rm -rf "$OUT"
mkdir -p "$OUT/shots"

UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
def version(runtime):
    tail = runtime.split("iOS-")[-1]
    return tuple(int(p) for p in tail.split("-") if p.isdigit())
for runtime in sorted((r for r in devices if "iOS" in r), key=version, reverse=True):
    for d in devices[runtime]:
        if d.get("isAvailable") and d["name"].startswith("iPhone"):
            print(d["udid"])
            sys.exit(0)
sys.exit(1)
')
if [ -z "$UDID" ]; then
  echo "::error::nessun simulatore iPhone disponibile"
  exit 1
fi
echo "Simulatore: $(xcrun simctl list devices available | grep "$UDID" | head -n 1)"

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl install "$UDID" "$APP"

run_app() {
  # $1 = nome del log, il resto = argomenti dell'app
  local name="$1"; shift
  xcrun simctl spawn "$UDID" log stream --level debug --style compact \
    --predicate 'process == "MareaProfonda"' > "$OUT/$name.oslog.txt" 2>&1 &
  local logpid=$!
  sleep 2
  ( sleep 420 & wait $!; echo "TIMEOUT: chiudo l'app"; xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 ) &
  local watchdog=$!
  SIMCTL_CHILD_OS_ACTIVITY_DT_MODE=YES xcrun simctl launch --console-pty --terminate-running-process \
    "$UDID" "$BUNDLE_ID" "$@" 2>&1 | while IFS= read -r line; do
      line="${line%$'\r'}"
      echo "$line"
      echo "$line" >> "$OUT/$name.log"
      case "$line" in
        *"SMOKE SHOT "*)
          shot="${line##*SMOKE SHOT }"
          xcrun simctl io "$UDID" screenshot "$OUT/shots/$shot.png" >/dev/null 2>&1 || echo "schermata non riuscita: $shot"
          ;;
      esac
    done
  pkill -P "$watchdog" >/dev/null 2>&1 || true
  kill "$watchdog" >/dev/null 2>&1 || true
  sleep 2
  kill "$logpid" >/dev/null 2>&1 || true
  touch "$OUT/$name.log"
}

# Righe che indicano un errore di compilazione degli shader o un arresto anomalo.
# (Verificate sul simulatore: uno shader sbagliato stampa "SKShader failed to compile".)
PATTERN='Fatal error|Terminating app|precondition failed|SKShader failed to compile|Compiler failed to build request|MTLLibraryErrorDomain'

echo "::group::Prova principale"
run_app app -smoke
echo "::endgroup::"

echo "::group::Canarino: shader volutamente sbagliato"
run_app canary -smoke -smoke-canary
echo "righe riconosciute nel canarino: $(grep -E -c "$PATTERN" "$OUT/canary.log")"
echo "::endgroup::"

# Le schermate escono con l'orientamento del dispositivo: le raddrizzo se sono verticali.
for f in "$OUT"/shots/*.png; do
  [ -f "$f" ] || continue
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/ {print $2}')
  h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/ {print $2}')
  if [ "$h" -gt "$w" ]; then sips -r -90 "$f" >/dev/null 2>&1; fi
  echo "schermata: $(basename "$f") ${w}x${h}"
done

echo "::group::Rapporti di crash"
CRASHES=$(ls -t ~/Library/Logs/DiagnosticReports/ 2>/dev/null | grep -i MareaProfonda | head -n 3)
if [ -n "$CRASHES" ]; then
  for c in $CRASHES; do
    echo "== $c"
    head -n 120 ~/Library/Logs/DiagnosticReports/"$c"
  done
fi
echo "::endgroup::"

FAIL=0
if ! grep -q "SMOKE DONE" "$OUT/app.log"; then
  echo "::error::la prova non è arrivata in fondo (manca SMOKE DONE)"
  FAIL=1
fi
if grep -q "SMOKE FAIL" "$OUT/app.log"; then
  echo "::error::la prova ha segnalato errori"
  grep "SMOKE FAIL" "$OUT/app.log"
  FAIL=1
fi
if grep -E -q "$PATTERN" "$OUT/app.log" "$OUT/app.oslog.txt"; then
  echo "::error::trovati errori di shader o arresti anomali nei log"
  grep -E -A 6 "$PATTERN" "$OUT/app.log" | head -n 60
  FAIL=1
fi
if [ -n "$CRASHES" ]; then
  echo "::error::l'app ha generato un rapporto di crash"
  FAIL=1
fi
if ! grep -E -q "$PATTERN" "$OUT/canary.log" "$OUT/canary.oslog.txt"; then
  echo "::warning::il canarino non ha prodotto righe riconoscibili: il controllo degli shader via log non è affidabile"
fi
exit $FAIL
