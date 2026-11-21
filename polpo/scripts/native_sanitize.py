# Aggiunge i sanitizer anche al linker per l'ambiente di test "native".
Import("env")  # noqa: F821

env.Append(LINKFLAGS=["-fsanitize=address,undefined"])  # noqa: F821
