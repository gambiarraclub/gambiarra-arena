# Prompts para gerar os diagramas (Nano Banana Pro / ChatGPT)

Este arquivo traz prompts prontos para gerar **versões alternativas em imagem** dos diagramas da arquitetura do Gambiarra Arena — para você ter opções além do `architecture.html`.

Há **4 diagramas**: (1) Topologia, (2) Comparação dos dois modos, (3) Sequência do Modo de Prompts, (4) Sequência do Modo Mundo.

---

## Como usar (dicas)

- **Proporção:** peça **16:9** (slide) ou **3:2**. Para diagramas com muito texto vertical (sequência), **9:16** ou **4:5** às vezes sai melhor.
- **Texto é o calcanhar de Aquiles** dos geradores de imagem. Mitigue: rótulos **curtos**, peça explicitamente *"texto nítido, legível, sem erros de ortografia, em português"*, e **gere 2–3 variações** e escolha a melhor (ou conserte texto depois no Figma/Canva).
- **Nano Banana Pro (Gemini):** lida bem com cenas detalhadas e texto. Cole o prompt inteiro. Se o texto sair torto, peça *"redesenhe mantendo o layout, corrigindo todo o texto"*.
- **ChatGPT (gpt-image, versão nova):** também aceita prompts longos; costuma ajudar terminar com *"flat vector infographic, crisp legible labels"*. Se quiser editar, peça variações iterativas.
- **Estilo:** os prompts abaixo pedem o visual **arcade-terminal neon** (combina com o `architecture.html`). Se preferir algo mais limpo para artigo/whitepaper, troque o bloco de estilo por: *"clean minimal flat vector diagram, light background, thin lines, muted palette"*.

### Bloco de estilo reutilizável (cole no início de qualquer prompt)
> Estilo: infográfico técnico em vetor plano, estética **arcade/terminal retrô (CRT)**, fundo **azul-escuro quase preto** com leve grade e brilho neon. Paleta: **laranja neon (#ff7a3d)**, **ciano (#2af0df)**, **verde (#54ff95)**, **roxo (#a06bff)**. Tipografia geométrica tipo *Chakra Petch* para títulos e **monoespaçada** para rótulos. Caixas com cantos arredondados e leve glow. Hierarquia clara, espaçamento generoso, **legível à distância (slide de projetor)**. Sem mockups de telas; só o diagrama. Todo o texto em **português**, curto e sem erros.

---

## 1) Topologia do sistema (hub-and-spoke)

> [COLE O BLOCO DE ESTILO ACIMA]
>
> Crie um **diagrama de arquitetura hub-and-spoke** do "Gambiarra Arena", em 3 camadas verticais conectadas por setas rotuladas:
>
> 1. **No topo:** uma caixa ciano escrita **"TELÃO — React/Vite"** e embaixo, menor, "/world · / · /control · /admin".
> 2. **No centro (a maior, em laranja, é o hub):** caixa **"SERVIDOR — Fastify"**, com três linhas menores dentro: "WS Hub · WorldEngine (simulação 20 Hz)", "EventLogger · SQLite + Prisma (WAL)", "endpoints: /ws · /api · /agent · /client".
> 3. **Embaixo:** uma caixa verde tracejada rotulada **"Máquina do participante · ×N (25+)"** contendo DUAS sub-caixas lado a lado: à esquerda **"Navegador — cliente /agent ou /client"** (verde); à direita **"LLM local — Ollama / LM Studio / llama.cpp"** (roxo).
>
> **Setas/conexões rotuladas:**
> - Telão ⇄ Servidor: seta dupla com rótulo **"WebSocket /ws + REST /api"**.
> - Servidor ⇄ Navegador: seta dupla com rótulo **"WebSocket /ws (registro · stream · ações)"**.
> - Navegador → LLM local: seta com rótulo **"fetch local (CORS)"**.
>
> Use cor das setas por tipo: laranja = comando, ciano = push do servidor, verde = resposta/stream, roxo = LLM/interno. Inclua uma pequena **legenda** dessas cores no canto. Proporção 16:9.

---

## 2) Comparação dos dois modos

> [COLE O BLOCO DE ESTILO ACIMA]
>
> Crie um **infográfico de comparação lado a lado** com dois painéis, título no topo **"Gambiarra Arena — dois modos, uma infraestrutura"**:
>
> **Painel esquerdo (borda ciano) — "Modo de Prompts (texto / SVG)":**
> - Subtítulo: "Um desafio, uma resposta".
> - Um **fluxo horizontal one-shot** com 4 blocos e setas: **prompt → gera → stream de tokens → voto**.
> - 3 bullets curtos: "Admin manda 1 desafio; todos respondem ao mesmo tempo", "Tokens aparecem no telão (texto ou SVG)", "Público vota → placar".
>
> **Painel direito (borda verde) — "Mundo de Agentes (2D)":**
> - Subtítulo: "Cada LLM controla um avatar".
> - Um **ciclo circular** (loop com 3 nós e setas em círculo): **PERCEBER (radar) → DECIDIR (LLM) → AGIR (passo)** voltando ao início.
> - 3 bullets curtos: "Cada participante é um avatar com um objetivo", "A cada radar, o LLM decide a direção", "Telão mostra os bichinhos se movendo + placar".
>
> Contraste visual claro: à esquerda uma **flecha reta** (mão única), à direita um **círculo** (loop). Proporção 16:9.

---

## 3) Sequência — Modo de Prompts

> [COLE O BLOCO DE ESTILO ACIMA]
>
> Crie um **diagrama de sequência (UML)** com 6 atores em colunas verticais (lifelines tracejadas), título **"Sequência — Modo de Prompts"**. Atores, da esquerda p/ direita: **Admin**, **Telão**, **Servidor**, **Cliente**, **LLM**, **Público**.
>
> Mensagens (setas horizontais entre as colunas, de cima p/ baixo, cada uma com rótulo curto):
> 1. Admin → Servidor: "POST /session → PIN"
> 2. Cliente → Servidor: "register (PIN + apelido)"
> 3. Admin → Servidor: "POST /rounds/start"
> 4. Servidor → Cliente: "challenge (prompt · svgMode)"
> 5. Cliente → LLM: "generate(prompt)"
> 6. LLM → Cliente: "tokens (stream)"
> 7. Cliente → Servidor: "token (seq)"
> 8. Servidor → Telão: "token_update"
> 9. Cliente → Servidor: "complete (métricas)"
> 10. Admin → Servidor: "POST /rounds/stop → abre votação"
> 11. Público → Servidor: "vote (QR → /voting)"
>
> **Destaque um retângulo tracejado laranja rotulado "⟳ para cada token"** envolvendo as mensagens 6, 7 e 8 (o loop de streaming). Cor das setas: laranja = comando, ciano = push, verde = stream/resposta. Proporção 4:5 ou 3:4 (vertical).

---

## 4) Sequência — Mundo de Agentes (o loop)

> [COLE O BLOCO DE ESTILO ACIMA]
>
> Crie um **diagrama de sequência (UML)** com 5 atores em colunas (lifelines tracejadas), título **"Sequência — Mundo de Agentes"**. Atores: **Admin**, **Telão**, **Servidor (WorldEngine)**, **Cliente (/agent)**, **LLM local**.
>
> Mensagens (de cima p/ baixo):
> 1. Admin → Servidor: "POST /world/start (objetivo · comidas)"
> 2. Cliente → Servidor: "register + world_join (emoji)"
> 3. Servidor → Cliente: "perception (radar: comida a NE…)"
> 4. Cliente → LLM: "prompt = objetivo + estratégia + radar"
> 5. LLM → Cliente: "direção + raciocínio"
> 6. Cliente → Servidor: "agent_action (direção)"
> 7. Servidor → Servidor (auto-mensagem/nota): "hop + colisão + score"
> 8. Servidor → Telão: "world_state (~20 Hz, contínuo)"
>
> **Destaque um grande retângulo tracejado laranja rotulado "⟳ loop perceber → decidir → agir"** envolvendo as mensagens 3 a 7. Marque a mensagem 8 (world_state) como **"contínuo / paralelo"**, fora do loop.
>
> Adicione, abaixo, um **box roxo de destaque** com o texto: *"A escolha: o avatar fica PARADO e dá UM passo só quando chega a decisão do LLM. Uma decisão = um passo visível. Mais lento, porém legível — dá pra ver o agente pensar e então agir."* Proporção 4:5 (vertical).

---

## Observações

- Se o gerador embaralhar as setas do diagrama de sequência (é comum), peça uma **versão mais simples** (menos mensagens) ou gere **só o loop** (mensagens 3–7 do Mundo) — costuma sair muito mais limpo.
- O `architecture.html` (nesta mesma pasta) é a **fonte da verdade** dos diagramas: abra no navegador para conferir rótulos, cores e a estrutura exata antes de gerar as imagens.
