# Dopo la compilazione crea un unico file .bin da scrivere all'indirizzo 0x0
# (bootloader + tabella partizioni + boot_app0 + firmware), da caricare con un
# flasher nel browser. Il file finisce in release/polpo-cardputer-<versione>.bin.
import os
import shutil
import subprocess

Import("env")  # noqa: F821


def merge_bin(source, target, env):
    build_dir = env.subst("$BUILD_DIR")
    app = os.path.join(build_dir, env.subst("${PROGNAME}.bin"))
    version = env.get("POLPO_VERSION", "dev")
    out_dir = os.path.join(env.subst("$PROJECT_DIR"), "release")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "polpo-cardputer-%s.bin" % version)

    # FLASH_EXTRA_IMAGES contiene (indirizzo, file) di bootloader, partizioni e boot_app0.
    images = [(str(addr), env.subst(str(path))) for addr, path in env.get("FLASH_EXTRA_IMAGES", [])]
    images.append((env.subst("$ESP32_APP_OFFSET") or "0x10000", app))
    for _, path in images:
        if not os.path.isfile(path):
            print("merge_bin: manca %s, salto" % path)
            return

    # Il pacchetto tool-esptool di PlatformIO contiene un eseguibile "esptool" (5.x).
    pkg = env.PioPlatform().get_package_dir("tool-esptool") or ""
    python = env.subst("$PYTHONEXE")
    if os.path.isfile(os.path.join(pkg, "esptool")):
        cmd = [os.path.join(pkg, "esptool")]
    elif os.path.isfile(os.path.join(pkg, "esptool.py")):
        cmd = [python, os.path.join(pkg, "esptool.py")]
    else:
        cmd = [python, "-m", "esptool"]
    cmd += [
        "--chip", "esp32s3", "merge-bin",
        "-o", out,
        "--flash-mode", "dio",
        "--flash-freq", "80m",
        "--flash-size", "8MB",
    ]
    for addr, path in images:
        cmd += [addr, path]
    print("merge_bin:", " ".join(cmd))
    try:
        subprocess.check_call(cmd)
    except Exception as exc:  # esptool vecchio: comando "merge_bin" con underscore
        print("merge_bin: nuovo tentativo con la sintassi esptool 4.x (%s)" % exc)
        cmd = [c.replace("merge-bin", "merge_bin").replace("--flash-mode", "--flash_mode")
               .replace("--flash-freq", "--flash_freq").replace("--flash-size", "--flash_size") for c in cmd]
        subprocess.check_call(cmd)
    shutil.copyfile(out, os.path.join(out_dir, "polpo-cardputer-latest.bin"))
    # Solo applicazione (indirizzo 0x10000): per gli aggiornamenti da Polpo Studio senza cancellare
    # le impostazioni salvate nella partizione NVS.
    app_only = os.path.join(out_dir, "polpo-cardputer-%s-app.bin" % version)
    shutil.copyfile(app, app_only)
    print("merge_bin: creato %s e %s" % (out, app_only))


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", merge_bin)  # noqa: F821
