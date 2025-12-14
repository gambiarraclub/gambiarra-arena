# Limites e Performance - Gambiarra Arena

Este documento descreve os limites de conexão, rate limiting e possíveis gargalos do sistema.

## Rate Limiting

O servidor usa `@fastify/rate-limit` para proteger contra abusos. A configuração padrão é:

| Variável | Valor Padrão | Descrição |
|----------|--------------|-----------|
| `RATE_LIMIT_MAX` | 100 | Máximo de requisições por IP |
| `RATE_LIMIT_TIME_WINDOW` | 60000 | Janela de tempo em ms (60 segundos) |

### Problema: Erro 429 (Too Many Requests)

Quando muitos clientes tentam conectar do mesmo IP (ex: localhost em testes), o limite é atingido rapidamente porque cada conexão WebSocket inicia com um HTTP upgrade request.

**Exemplo:** 1000 clientes mockados do mesmo IP → 1000 requisições HTTP → limite de 100 atingido em < 1 segundo → erro 429.

### Solução para Testes Locais

**Opção 1: Variáveis de ambiente temporárias**
```bash
RATE_LIMIT_MAX=2000 pnpm dev
```

**Opção 2: Arquivo `.env` local**
```env
# server/.env
RATE_LIMIT_MAX=2000
RATE_LIMIT_TIME_WINDOW=60000
```

**Opção 3: Para testes de stress pesados**
```bash
RATE_LIMIT_MAX=10000 pnpm dev
```

## Limites de WebSocket

### Configuração Atual

| Variável | Valor Padrão | Descrição |
|----------|--------------|-----------|
| `WS_MAX_PAYLOAD` | 1048576 | Tamanho máximo de mensagem (1MB) |
| `WS_COMPRESSION` | false | Compressão desabilitada para LAN |

### Intervalos de Manutenção

| Intervalo | Valor | Descrição |
|-----------|-------|-----------|
| Heartbeat | 30s | Broadcast de keepalive para clientes |
| Ping | 15s | Detecção de conexões mortas |

## Gargalos Potenciais

### 1. Rate Limiting por IP (Principal)

- **Impacto:** Bloqueia novas conexões quando limite é atingido
- **Sintoma:** Erro HTTP 429
- **Solução:** Aumentar `RATE_LIMIT_MAX` para ambientes de teste

### 2. SQLite

- **Impacto:** Não ideal para alta concorrência de escrita
- **Sintoma:** Lentidão em inserções simultâneas de métricas
- **Cenário:** Muitos clientes completando geração ao mesmo tempo
- **Mitigação:** O sistema usa operações assíncronas e batch quando possível

### 3. Prisma Connection Pool

- **Impacto:** Pool de conexões limitado por padrão
- **Sintoma:** Timeouts em operações de banco
- **Solução:** Configurar `connection_limit` no DATABASE_URL se necessário

### 4. Node.js Event Loop

- **Impacto:** 1000+ conexões WebSocket com broadcast pode saturar
- **Sintoma:** Atrasos na entrega de mensagens
- **Mitigação:** Broadcasts são feitos de forma assíncrona

### 5. Memória (Token Buffer)

- **Impacto:** O hub mantém todos os tokens em memória
- **Sintoma:** Alto uso de RAM com muitos participantes e tokens longos
- **Estrutura:**
  ```
  tokenBuffer: Map<participantId, Map<roundId, string[]>>
  firstTokenTime: Map<participantId, Map<roundId, Date>>
  generationStartTime: Map<participantId, Map<roundId, Date>>
  ```

## Recomendações por Escala

### Pequeno (até 20 clientes)
- Configuração padrão funciona bem
- `RATE_LIMIT_MAX=100`

### Médio (20-100 clientes)
- Aumentar rate limit
- `RATE_LIMIT_MAX=500`

### Grande (100-500 clientes)
- Rate limit alto
- Monitorar uso de memória
- `RATE_LIMIT_MAX=2000`

### Stress Test (500+ clientes)
- Rate limit muito alto ou desabilitado
- Considerar múltiplas instâncias do servidor
- `RATE_LIMIT_MAX=10000`

## Monitoramento

### Verificar Conexões Ativas

```bash
# Via API de presença
curl http://localhost:3000/api/presence | jq '.participants | length'
```

### Verificar Health

```bash
curl http://localhost:3000/health
```

### Logs de Debug

O servidor usa nível de log `warn` por padrão. Para debug:
```bash
NODE_ENV=development pnpm dev
```

## Configuração Completa

Todas as variáveis de ambiente disponíveis em `server/.env.example`:

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL="file:./dev.db"

# CORS
CORS_ORIGIN=*

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW=60000

# WebSocket
WS_COMPRESSION=false
WS_MAX_PAYLOAD=1048576

# mDNS (opcional)
MDNS_HOSTNAME=gambiarra-arena
```
