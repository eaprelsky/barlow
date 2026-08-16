#!/usr/bin/env bash
# Сборка десктоп-версии: закрыть запущенное окно (exe занят), собрать,
# обновить установленную копию и запустить её.
set -e
cd "$(dirname "$0")/.."

taskkill //IM barlow.exe //F 2>/dev/null || true
sleep 1

export PATH="$HOME/.cargo/bin:$PATH"
if [ -z "$HTTPS_PROXY" ]; then
  # крейты качаются через локальный прокси, если прямой сети нет
  export HTTPS_PROXY=http://127.0.0.1:12334 HTTP_PROXY=http://127.0.0.1:12334
fi

npx tauri build

DEST="$LOCALAPPDATA/barlow"
if [ -d "$DEST" ]; then
  cp src-tauri/target/release/barlow.exe "$DEST/barlow.exe"
  echo "установленная копия обновлена: $DEST"
  # запуск отсоединённо: GUI-процесс наследует stdout npm и держит пайп
  (cd "$DEST" && ./barlow.exe >/dev/null 2>&1 &)
  echo "запущено"
else
  echo "установки нет — exe: src-tauri/target/release/barlow.exe"
  echo "поставить: src-tauri/target/release/bundle/nsis/barlow_*-setup.exe /S"
fi
