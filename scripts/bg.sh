#!/usr/bin/env bash
# Фоновый запуск долгой команды с лог-файлом вместо пайпа:
#   bash scripts/bg.sh <имя> <команда...>
#   лог — tmp/bg-<имя>.log: пишется с хода, читай в любой момент
#         (tail -f tmp/bg-<имя>.log / tail -20 …)
#   пид — tmp/bg-<имя>.pid: остановить —
#         taskkill //PID $(cat tmp/bg-<имя>.pid) //T //F
#
# Почему не `команда | tail`: tail копит вывод до конца — лог пуст всю
# сборку («Fetching output» вслепую); а живущий дольше команды ребёнок
# (GUI-приложение, dev-сервер) держит пайп открытым — задача не получает
# EOF и висит «выполняющейся» после того, как работа давно закончилась.
# Запись в файл лишена обеих проблем: EOF не нужен, прогресс виден сразу.
set -e
cd "$(dirname "$0")/.."

if [ $# -lt 2 ]; then
  echo "использование: bash scripts/bg.sh <имя> <команда...>" >&2
  exit 2
fi
name="$1"
shift

mkdir -p tmp
: > "tmp/bg-$name.log"
nohup "$@" > "tmp/bg-$name.log" 2>&1 &
echo $! > "tmp/bg-$name.pid"
echo "лог: tmp/bg-$name.log   (по ходу: tail -f tmp/bg-$name.log)"
echo "пид: $(cat "tmp/bg-$name.pid")   (стоп: taskkill //PID \$(cat tmp/bg-$name.pid) //T //F)"
