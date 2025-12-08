# ⚡ Quick Start - 5 Minutos para Rodar

## Opção 1: Desenvolvimento Local (Recomendado)

### 1. Pré-requisitos
```bash
# Verificar Node.js 20+
node --version

# Instalar pnpm se não tiver
npm install -g pnpm
```

### 2. Instalação
```bash
# Clonar repositório
git clone <URL_DO_REPO>
cd gambiarra-club-framework-chatgpt

# Instalar todas as dependências
pnpm install

# Configurar banco de dados (a partir da raiz do projeto)
pnpm --filter @gambiarra/server db:migrate
pnpm --filter @gambiarra/server seed  # Cria sessão com PIN 123456
```

### 3. Iniciar
```bash
# Terminal 1: Servidor + Telão
pnpm dev

# Aguarde ambos iniciarem, então:

# Terminal 2: Simular 5 clientes
pnpm simulate
```

### 4. Acessar

- **Arena:** http://localhost:5173
- **Votação:** http://localhost:5173/voting
- **Placar:** http://localhost:5173/scoreboard
- **Admin:** http://localhost:5173/admin
- **API:** http://localhost:3000

### 5. Criar e Iniciar Rodada

```bash
# Pegar ID da rodada criada pelo seed
curl http://localhost:3000/session | jq '.rounds[0].id'

# Iniciar rodada (substitua ROUND_ID)
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId": "f17c6004-abbd-4e16-a4ef-5fe6a61101c4"}'
```

**Pronto!** Os clientes simulados começarão a gerar tokens visíveis no telão.

## Opção 2: Docker (Mais Simples)

```bash
# Iniciar tudo
docker compose up --build

# Em outro terminal, criar sessão
curl -X POST http://localhost:3000/session | jq

# Criar e iniciar rodada
curl -X POST http://localhost:3000/rounds \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Escreva uma poesia sobre IA", "maxTokens": 400}' | jq

curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId": "ROUND_ID"}' | jq
```

Acesse: http://localhost:5173

**Nota:** Com Docker, você precisará rodar os clientes fora dos containers.

## Opção 3: Cliente Real com Ollama

### Pré-requisitos
```bash
# Instalar Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Baixar modelo
ollama pull llama3.1:8b

# Iniciar Ollama (se não estiver rodando)
ollama serve
```

### Executar
```bash
# Terminal 1: Servidor
cd server && pnpm dev

# Terminal 2: Telão
cd telao && pnpm dev

# Terminal 3: Cliente real
cd client
pnpm dev -- \
  --url ws://localhost:3000/ws \
  --pin 123456 \
  --participant-id meu-pc \
  --nickname "Seu Nome" \
  --runner ollama \
  --model llama3.1:8b
```

## Comandos Úteis

```bash
# Ver sessão ativa
curl http://localhost:3000/session | jq

# Ver placar
curl http://localhost:3000/scoreboard | jq

# Exportar CSV
curl http://localhost:3000/export.csv

# Criar nova sessão
curl -X POST http://localhost:3000/session | jq

# Health check
curl http://localhost:3000/health

# Resetar banco
cd server
rm -f prisma/dev.db
pnpm db:migrate
pnpm seed
```

## Troubleshooting Rápido

**"Command not found: pnpm"**
```bash
npm install -g pnpm
```

**"Port 3000 already in use"**
```bash
# Mudar porta
cd server
echo "PORT=3001" > .env
pnpm dev
```

**"No active session"**
```bash
curl -X POST http://localhost:3000/session | jq
```

**Telão em branco**
```bash
# Verificar servidor
curl http://localhost:3000/health

# Recarregar página
# Verificar console (F12)
```

**Cliente não conecta**
```bash
# Verificar se rodada foi iniciada
curl http://localhost:3000/rounds/current | jq

# Iniciar rodada
curl -X POST http://localhost:3000/rounds/start \
  -H "Content-Type: application/json" \
  -d '{"roundId": "ID_AQUI"}'
```

## Próximos Passos

1. ✅ Tudo funcionando? Leia [README.md](README.md) completo
2. 🎭 Quer fazer ensaio completo? Veja [ENSAIO.md](ENSAIO.md)
3. 🔧 Quer customizar? Veja [CLAUDE.md](CLAUDE.md)
4. 📦 Deploy produção? Use `docker compose up --build`

## Rede Local (LAN Party)

Para usar em múltiplos computadores:

1. **Servidor:** Descobra IP local
```bash
# macOS/Linux
ifconfig | grep "inet "

# Windows
ipconfig
```

2. **Clientes:** Use IP do servidor
```bash
pnpm dev -- \
  --url ws://192.168.1.100:3000/ws \
  --pin 123456 \
  --participant-id participante-1 \
  --nickname "Nome" \
  --runner ollama \
  --model llama3.1:8b
```

3. **Público:** Acesse telão em `http://192.168.1.100:5173`

---

**Dúvidas?** Consulte a documentação completa ou abra uma issue no GitHub.

**Bora gambiarra! 🔧🎨**
