#!/usr/bin/env bash
# Сборка десктоп-версии: закрыть запущенное окно (exe занят), собрать,
# обновить установленную копию и запустить её.
set -e
cd "$(dirname "$0")/.."

taskkill //IM barlow.exe //F 2>/dev/null || true
sleep 1

export PATH="$HOME/.cargo/bin:$PATH"
# Один поток сборки: параллельные rustc на windows-крейтах упираются в
# commit-лимит машины (os error 1455 / STATUS_STACK_BUFFER_OVERRUN).
export CARGO_BUILD_JOBS=1
if [ -z "$HTTPS_PROXY" ]; then
  # крейты качаются через локальный прокси, если прямой сети нет
  export HTTPS_PROXY=http://127.0.0.1:12334 HTTP_PROXY=http://127.0.0.1:12334
fi

# По умолчанию — без инсталляторов (msi/nsis): для обновления установленной
# копии нужен только exe, а WiX/NSIS едят минуты на каждый прогон.
# Полные бандлы — явным флагом: BARLOW_BUNDLE=1 npm run desktop
BUNDLE_ARGS=(--no-bundle)
if [ "${BARLOW_BUNDLE:-0}" = "1" ]; then
  BUNDLE_ARGS=()
fi
npx tauri build "${BUNDLE_ARGS[@]}"

DEST="$LOCALAPPDATA/barlow"
if [ -d "$DEST" ]; then
  cp src-tauri/target/release/barlow.exe "$DEST/barlow.exe"
  echo "установленная копия обновлена: $DEST"
  # запуск отсоединённо: GUI-процесс наследует stdout npm и держит пайп
  (cd "$DEST" && ./barlow.exe >/dev/null 2>&1 &)
  echo "запущено"
else
  echo "установки нет — exe: src-tauri/target/release/barlow.exe"
  echo "поставить: BARLOW_BUNDLE=1 npm run desktop → src-tauri/target/release/bundle/nsis/barlow_*-setup.exe /S"
fi
