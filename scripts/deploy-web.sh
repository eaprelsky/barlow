#!/usr/bin/env bash
# Деплой веб-версии на barlow.eaprelsky.ru (nocturna, nginx статика).
set -e
cd "$(dirname "$0")/.."
npm run build
tar -C dist -cf - . | ssh ubuntu@nocturna.ru "find /var/www/barlow -mindepth 1 -delete && tar -C /var/www/barlow -xf -"
echo "готово: https://barlow.eaprelsky.ru"
