#!/bin/sh
# Prueba de humo del agente en modo archivo.
cd "$(dirname "$0")"
rm -rf ./.smoke-out
node datta-print-agent.mjs --sink ./.smoke-out --port 9111 &
PID=$!
sleep 1.5
curl -s http://127.0.0.1:9111/status; echo
curl -s -X POST http://127.0.0.1:9111/print -H 'content-type: application/json' --data-binary @smoke-job.json; echo
curl -s -o /dev/null -w 'origen ajeno: %{http_code}\n' -H 'Origin: https://evil.example' http://127.0.0.1:9111/status
curl -s -o /dev/null -w 'origen datta: %{http_code}\n' -H 'Origin: https://dattagestion.com' http://127.0.0.1:9111/status
ls -l ./.smoke-out
kill $PID
