#!/usr/bin/env bash
# Costruisce l'APK di Marea Profonda, senza Gradle: compila il gioco (Swift) per ogni architettura
# con lo Swift SDK per Android, compila il guscio Java, impacchetta, allinea e firma.
#
# Uso (dalla radice del repository):
#   ANDROID_HOME=... ANDROID_NDK_HOME=... Android/build.sh
#
# Variabili facoltative:
#   ABIS          architetture da includere (predefinito: "arm64-v8a armeabi-v7a")
#   APK_NAME      nome del file prodotto in build/android/ (predefinito: MareaProfonda.apk)
#   VERSION_CODE  numero di build (predefinito: 1; in CI è il numero della run)
#   SWIFT         comando swift da usare (predefinito: swift)
#
# Servono: Swift 6.4.3 con lo "Swift SDK for Android" installato (swift sdk install ...),
# NDK r27 o successivo, build-tools e una piattaforma dell'SDK Android, un JDK.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERE="$ROOT/Android"
OUT="${OUT:-$ROOT/build/android}"
ABIS="${ABIS:-arm64-v8a armeabi-v7a}"
APK_NAME="${APK_NAME:-MareaProfonda.apk}"
VERSION_CODE="${VERSION_CODE:-1}"
SWIFT="${SWIFT:-swift}"
MIN_API=24
TARGET_API=36

: "${ANDROID_HOME:?imposta ANDROID_HOME (cartella dell'SDK Android)}"
: "${ANDROID_NDK_HOME:?imposta ANDROID_NDK_HOME (cartella dell'NDK)}"

VERSION_NAME="$(sed -n 's/.*MARKETING_VERSION: *"\(.*\)".*/\1/p' "$ROOT/project.yml" | head -n 1)"
VERSION_NAME="${VERSION_NAME:-0.1.0}"

BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -n 1)"
PLATFORM_JAR="$(ls -d "$ANDROID_HOME"/platforms/android-* | sort -V | tail -n 1)/android.jar"
NDK_PREBUILT="$(ls -d "$ANDROID_NDK_HOME"/toolchains/llvm/prebuilt/* | head -n 1)"
READELF="$NDK_PREBUILT/bin/llvm-readelf"
STRIP="$NDK_PREBUILT/bin/llvm-strip"

# Lo Swift SDK per Android: da lì vengono le librerie di runtime da mettere nell'APK.
SDK_BUNDLE=""
for candidate in "$HOME"/.swiftpm/swift-sdks/*android*.artifactbundle "$HOME"/.config/swiftpm/swift-sdks/*android*.artifactbundle \
                 "$HOME"/Library/org.swift.swiftpm/swift-sdks/*android*.artifactbundle; do
    if [ -d "$candidate" ]; then SDK_BUNDLE="$candidate"; fi
done
if [ -z "$SDK_BUNDLE" ]; then
    echo "Swift SDK per Android non trovato: installalo con 'swift sdk install'." >&2
    exit 1
fi
if [ ! -d "$SDK_BUNDLE/swift-android/ndk-sysroot" ]; then
    "$SDK_BUNDLE/swift-android/scripts/setup-android-sdk.sh"
fi

echo "== Marea Profonda $VERSION_NAME ($VERSION_CODE) per: $ABIS"
echo "   build-tools: $BUILD_TOOLS"
echo "   piattaforma: $PLATFORM_JAR"

rm -rf "$OUT/stage"
mkdir -p "$OUT/stage/lib" "$OUT/stage/assets" "$OUT/stage/classes" "$OUT/stage/gen/it/mareaprofonda/game"

# Copia nella cartella dell'architettura le librerie da cui dipende $1, e quelle da cui dipendono loro.
copy_deps() {
    local file="$1" dir="$2" swift_libs="$3" ndk_libs="$4" lib
    for lib in $("$READELF" -d "$file" | sed -n 's/.*(NEEDED).*\[\(.*\)\]/\1/p'); do
        [ -f "$dir/$lib" ] && continue
        if [ -f "$swift_libs/$lib" ]; then
            cp "$swift_libs/$lib" "$dir/$lib"
            copy_deps "$dir/$lib" "$dir" "$swift_libs" "$ndk_libs"
        elif [ "$lib" = "libc++_shared.so" ]; then
            cp "$ndk_libs/$lib" "$dir/$lib"
        fi
    done
}

for abi in $ABIS; do
    case "$abi" in
        arm64-v8a)   arch=aarch64; triple=aarch64-unknown-linux-android$MIN_API; ndk_triple=aarch64-linux-android ;;
        armeabi-v7a) arch=armv7;   triple=armv7-unknown-linux-android$MIN_API;   ndk_triple=arm-linux-androideabi ;;
        x86_64)      arch=x86_64;  triple=x86_64-unknown-linux-android$MIN_API;  ndk_triple=x86_64-linux-android ;;
        *) echo "architettura non prevista: $abi" >&2; exit 1 ;;
    esac
    echo "== Libreria nativa per $abi"
    scratch="$OUT/swift-$abi"
    (cd "$ROOT" && "$SWIFT" build -c release --swift-sdk "$triple" --product MareaProfonda --scratch-path "$scratch" 2>&1 \
        | grep -Ev "no rule to process|^    /|unhandled; explicitly" || true)
    built="$(find "$scratch" -name libMareaProfonda.so -type f | head -n 1)"
    if [ -z "$built" ]; then
        echo "compilazione fallita per $abi" >&2
        (cd "$ROOT" && "$SWIFT" build -c release --swift-sdk "$triple" --product MareaProfonda --scratch-path "$scratch" 2>&1 | grep -E "error" | head -n 40) >&2 || true
        exit 1
    fi
    dir="$OUT/stage/lib/$abi"
    mkdir -p "$dir"
    cp "$built" "$dir/libMareaProfonda.so"
    copy_deps "$dir/libMareaProfonda.so" "$dir" "$SDK_BUNDLE/swift-android/swift-resources/usr/lib/swift-$arch/android" \
              "$NDK_PREBUILT/sysroot/usr/lib/$ndk_triple"
    "$STRIP" --strip-unneeded "$dir"/*.so
    ls "$dir" | sed 's/^/   /'
done

echo "== Risorse"
mkdir -p "$OUT/stage/assets/Data" "$OUT/stage/assets/Sprites"
cp "$ROOT"/MareaProfonda/Data/*.json "$OUT/stage/assets/Data/"
cp "$ROOT"/MareaProfonda/Resources/Sprites/*.spr "$OUT/stage/assets/Sprites/"
# Impronta delle risorse: quando cambia, l'app le ricopia al primo avvio dopo l'aggiornamento.
STAMP="$(cd "$OUT/stage/assets" && find . -type f | sort | xargs cat | sha1sum | cut -c 1-12)"
cat > "$OUT/stage/gen/it/mareaprofonda/game/BuildInfo.java" <<EOF
package it.mareaprofonda.game;

/** Generato da Android/build.sh. */
final class BuildInfo {
    private BuildInfo() {}
    static final String VERSION_CODE = "$VERSION_CODE-$STAMP";
}
EOF

echo "== Guscio Java"
javac -Xlint:-options --release 8 -cp "$PLATFORM_JAR" -d "$OUT/stage/classes" \
    $(find "$HERE/java" "$OUT/stage/gen" -name '*.java')
"$BUILD_TOOLS/d8" --release --lib "$PLATFORM_JAR" --min-api "$MIN_API" --output "$OUT/stage" \
    $(find "$OUT/stage/classes" -name '*.class')

echo "== Pacchetto"
"$BUILD_TOOLS/aapt2" compile --dir "$HERE/res" -o "$OUT/stage/res.zip"
"$BUILD_TOOLS/aapt2" link -o "$OUT/stage/base.apk" -I "$PLATFORM_JAR" --manifest "$HERE/AndroidManifest.xml" \
    -A "$OUT/stage/assets" --min-sdk-version "$MIN_API" --target-sdk-version "$TARGET_API" \
    --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$OUT/stage/res.zip"
(cd "$OUT/stage" && zip -q -r base.apk classes.dex lib)
"$BUILD_TOOLS/zipalign" -f 4 "$OUT/stage/base.apk" "$OUT/stage/aligned.apk"
# Chiave di prova versionata nel repository (non è un segreto): firmando sempre con la stessa,
# una versione nuova si installa sopra la vecchia senza perdere i salvataggi.
"$BUILD_TOOLS/apksigner" sign --ks "$HERE/debug.keystore" --ks-pass pass:android --key-pass pass:android \
    --ks-key-alias marea --out "$OUT/$APK_NAME" "$OUT/stage/aligned.apk"
"$BUILD_TOOLS/apksigner" verify "$OUT/$APK_NAME"
rm -f "$OUT/$APK_NAME.idsig"
ls -la "$OUT/$APK_NAME"
