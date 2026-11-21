#!/bin/sh
# Installa Polpo Studio per l'utente corrente (in ~/.local) e, se vuoi, la regola udev (chiede la password).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/polpo-studio-app"
mkdir -p "$DEST" "$HOME/.local/bin" "$HOME/.local/share/applications"
cp -r "$DIR/PolpoStudio/." "$DEST/"
ln -sf "$DEST/PolpoStudio" "$HOME/.local/bin/PolpoStudio"
sed "s|^Exec=.*|Exec=$DEST/PolpoStudio|" "$DIR/polpo-studio.desktop" > "$HOME/.local/share/applications/polpo-studio.desktop"
echo "Polpo Studio installato in $DEST"
printf "Installare anche la regola udev per le porte seriali (serve sudo)? [s/N] "
read -r ans
if [ "$ans" = "s" ] || [ "$ans" = "S" ]; then
  sudo cp "$DIR/99-polpo-studio.rules" /etc/udev/rules.d/
  sudo udevadm control --reload && sudo udevadm trigger
  echo "Regola udev installata. Scollega e ricollega il Polpo."
fi
