# Inserisce versione e commit git nel firmware (POLPO_VERSION, POLPO_GIT).
import subprocess

Import("env")  # noqa: F821

VERSION = "0.1.0"


def git_rev():
    try:
        return (
            subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL)
            .decode()
            .strip()
        )
    except Exception:
        return "nogit"


env.Append(  # noqa: F821
    CPPDEFINES=[
        ("POLPO_VERSION", '\\"%s\\"' % VERSION),
        ("POLPO_GIT", '\\"%s\\"' % git_rev()),
    ]
)
env["POLPO_VERSION"] = VERSION  # noqa: F821
