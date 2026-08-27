#!/usr/bin/env bash
# Enables the Luna floating bar (GNOME Shell extension).
#
# The files are already in ~/.local/share/gnome-shell/extensions/luna@local.
# GNOME only rescans that directory when the shell starts, and on Wayland the
# shell cannot be restarted in place — so this must be run AFTER a log out and
# back in.
set -euo pipefail

UUID="luna@local"

if ! gnome-extensions list 2>/dev/null | grep -q "$UUID"; then
  echo "GNOME can't see the extension yet."
  echo "Log out and back in, then run this again."
  exit 1
fi

gnome-extensions enable "$UUID"
echo "Luna bar enabled."
echo
echo "  Bottom-centre of your screen, above every window."
echo "  Type and press Enter to ask · ◉ for voice · Super+Space to focus"
echo
echo "Disable any time with:  gnome-extensions disable $UUID"
