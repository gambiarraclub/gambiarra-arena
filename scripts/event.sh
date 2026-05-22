#!/usr/bin/env bash
#
# Modo Evento — sobe o Gambiarra Arena de forma robusta para muitas pessoas
# (ex.: 25+ participantes com seus próprios LLMs locais).
#
# Diferenças para o `pnpm dev`:
#   • Servidor BUILDADO (node dist/index.js), SEM `tsx watch` — assim um arquivo
#     salvo por engano NÃO reinicia o servidor e NÃO derruba as conexões WebSocket
#     de todo mundo no meio do evento.
#   • ulimit de file descriptors aumentado (à prova de tempestade de reconexões).
#   • Telão em modo dev mesmo — só a máquina do apresentador o usa; os
#     participantes batem direto no servidor (:3000/agent e :3000/ws).
#
# Uso:  pnpm event      (ou: bash scripts/event.sh)
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "🎤 Gambiarra Arena — Modo Evento"
echo ""

# 1) Mais file descriptors (resiliência a muitas conexões/reconexões)
ulimit -n 4096 2>/dev/null || true
echo "• file descriptors (ulimit -n): $(ulimit -n)"

# 2) Dependências
if [ ! -d node_modules ]; then
  echo "• instalando dependências (pnpm install)..."
  pnpm install
fi

# 3) Config + banco (Prisma)
if [ ! -f server/.env ]; then
  echo "• criando server/.env a partir do exemplo"
  cp server/.env.example server/.env
fi
echo "• preparando banco de dados (Prisma)..."
pnpm --filter @gambiarra/server db:generate
pnpm --filter @gambiarra/server exec prisma db push --skip-generate

# 4) Build do servidor (sem watch)
echo "• compilando servidor..."
pnpm --filter @gambiarra/server build

# 5) Sobe servidor (node dist) + telão (vite). Ctrl+C encerra os dois.
trap 'echo; echo "🛑 Encerrando..."; kill 0' INT TERM
echo "• iniciando servidor (node dist/index.js)..."
( cd "$ROOT/server" && exec node dist/index.js ) &
echo "• iniciando telão (vite)..."
( cd "$ROOT/telao" && exec ./node_modules/.bin/vite ) &

# Descobre o IP na LAN para facilitar (macOS)
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<seu-ip-na-rede>')"
sleep 2
cat <<BANNER

════════════════════════════════════════════════════════════
  ✅ No ar!
  • Controle (você):       http://localhost:5173/control
  • Telão / projetor:      http://localhost:5173/world
  • Participantes abrem:   http://$IP:3000/agent
  Ctrl+C encerra tudo.
════════════════════════════════════════════════════════════
BANNER
wait
