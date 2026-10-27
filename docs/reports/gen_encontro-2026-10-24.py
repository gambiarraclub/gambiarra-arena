#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera o relatório HTML do 8º encontro do Gambiarra LLM Club (24/10/2026)
a partir do banco dev-2026-10-24.db e do log do servidor. Tema central: o
Wi-Fi do Porto Digital isolava os aparelhos uns dos outros, ninguém alcançava
a Arena pelo IP, e a sala só entrou depois de um túnel ngrok expor o servidor
na internet. Três rodadas de SVG, nenhum voto e nenhum World."""
import sqlite3, json, re, base64, html, collections, datetime, os, math

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(REPO, 'server/prisma/dev-2026-10-24.db')
DB_7 = os.path.join(REPO, 'server/prisma/dev-2026-08-22.db')            # 7º encontro, mesma capivara
DB_OF = os.path.join(REPO, 'server/prisma/dev-2026-09-30-recnplay.db')  # oficina, mesma capivara
LOG = os.path.join(REPO, 'server/logs/server-2026-10-24.log')
OUT = os.path.join(REPO, 'docs/reports/encontro-2026-10-24.html')

# immutable=1: leitura sem tocar no arquivo (o mode=ro falha em banco WAL
# sem os arquivos -wal/-shm, ver docs/reports/README.md)
def abre(p):
    c = sqlite3.connect(f'file:{p}?immutable=1', uri=True)
    c.row_factory = sqlite3.Row
    return c
db, db7, dbof = abre(DB), abre(DB_7), abre(DB_OF)

# O servidor ficou no ar até 27/10; o encontro foi das 9h às 12h de 24/10.
# Tudo depois das 15h é só o telão parado consultando o servidor.
DIA = datetime.date(2026, 10, 24)
FIM = datetime.datetime(2026, 10, 24, 15, 0)
def ts(ms): return datetime.datetime.fromtimestamp(ms/1000)
def hm(ms): return ts(ms).strftime('%H:%M')

# ---------------- dados ----------------
sessao = db.execute('SELECT id, createdAt FROM sessions').fetchone()
S_ID = sessao['id'][:8]
rounds = {r['index']: r for r in db.execute('SELECT * FROM rounds ORDER BY "index"')}

def metrics_for(idx):
    # 'model' é o que a pessoa cadastrou; 'real' é o que de fato gerou
    return db.execute("""
      SELECT p.nickname nick, p.model model, json_extract(m.modelInfo,'$.name') real,
             json_extract(m.modelInfo,'$.runner') runner,
             m.tokens, m.tpsAvg tps, m.latencyFirstTokenMs ttft, m.durationMs dur, m.generatedContent content
      FROM metrics m JOIN rounds r ON m.roundId=r.id JOIN participants p ON m.participantId=p.id
      WHERE r."index"=? ORDER BY m.durationMs""", (idx,)).fetchall()
mets = {i: metrics_for(i) for i in rounds}
geracoes = sum(len(v) for v in mets.values())
total_votes = db.execute('SELECT count(*) FROM votes').fetchone()[0]

ev = db.execute('SELECT timestamp, eventType, actorId, targetId, metadata FROM event_logs ORDER BY timestamp').fetchall()
def evs(tipo): return [e for e in ev if e['eventType'] == tipo]
reg = evs('participant_registered')
primeiro_cadastro = reg[0]['timestamp']
espera_min = (primeiro_cadastro - sessao['createdAt']) // 60000
# Abertura e fechamento da urna, por rodada
urna = {}
for e in ev:
    if e['eventType'] in ('voting_opened', 'voting_closed'):
        urna.setdefault(e['targetId'], {})[e['eventType']] = e['timestamp']
urna_seg = [round((u['voting_closed'] - u['voting_opened'])/1000) for u in urna.values()]

# Elenco por id. Um id pode ter se cadastrado várias vezes; o modelo é o do
# último cadastro do dia do encontro.
ultimo = {}
for e in reg:
    if ts(e['timestamp']) < FIM: ultimo[e['actorId']] = json.loads(e['metadata'])
pessoas = sorted({m['nickname'].strip() for m in ultimo.values()}, key=str.lower)
gerou = collections.Counter()
for i, ms in mets.items():
    for r in ms:
        if r['tokens'] > 0: gerou[r['nick'].strip()] += 1
no_telao = [p for p in pessoas if gerou[p]]
modelos_gerou = sorted({(r['real'] or r['model']).strip() for ms in mets.values() for r in ms if r['tokens'] > 0})

# ---------------- log ----------------
# trustProxy: atrás do ngrok, o 'ip' do log é o do participante (X-Forwarded-For).
LOCAIS = {'127.0.0.1', '10.0.11.137', '172.20.10.4'}  # o próprio Mac, nas duas redes
req_ext = collections.Counter(); por_ip_min = collections.Counter()
c429 = boots = 0; ips_ext = set(); ips_hotspot = set(); primeiro_tunel = None
erros = collections.defaultdict(list); ws_dead = collections.Counter()
_prev_t = None; maior_silencio = (0, None, None)
for line in open(LOG):
    try: d = json.loads(line)
    except Exception: continue
    t = ts(d['time'])
    if t.date() != DIA: continue
    m = d.get('msg', '')
    if m == 'incoming request':
        ip = d.get('ip') or d['req'].get('remoteAddress')
        # o silêncio que interessa é o do meio da manhã; à tarde só sobra o
        # telão parado, com consultas de meia em meia hora
        if datetime.datetime(2026, 10, 24, 10, 40) < t < datetime.datetime(2026, 10, 24, 11, 30) and _prev_t and (t - _prev_t).total_seconds() > maior_silencio[0]:
            maior_silencio = ((t - _prev_t).total_seconds(), _prev_t, t)
        _prev_t = t
        if ip in LOCAIS: continue
        ips_ext.add(ip)
        if ip.startswith('172.20.10.'): ips_hotspot.add(ip)
        elif primeiro_tunel is None: primeiro_tunel = t
        req_ext[t.strftime('%H:%M')] += 1
        por_ip_min[(ip, t.strftime('%H:%M'))] += 1
    elif m.startswith('HTTP_429'): c429 += 1
    elif 'listening' in m.lower(): boots += 1
    elif m == 'Client error':
        msg = d['message']; erros[msg['participant_id']].append((msg['round'], msg['message']))
    elif m.startswith('WS_DEAD'): ws_dead[d.get('participantId')] += 1
ips_tunel = ips_ext - ips_hotspot
pico_ip = max(por_ip_min.values())
total_req_ext = sum(req_ext.values())
silencio_min = round(maior_silencio[0] / 60)
# o maior número de desconexões no mesmo segundo (o Mac voltando do silêncio)
quedas_juntas = collections.Counter(e['timestamp'] // 1000 for e in evs('participant_disconnected')).most_common(1)[0]

# Por que cada um ficou fora do telão: os erros que o navegador mandou ao
# servidor, a conexão derrubada por falta de pong ou a chegada tardia.
inicio_r3 = rounds[3]['startedAt']
def motivo(pid, meta):
    es = erros.get(pid, [])
    txt = ' '.join(x for _, x in es)
    if 'Failed to fetch' in txt:
        return f'o navegador não alcançou o modelo ("Failed to fetch") nas {len({r for r, _ in es})} rodadas'
    if 'groq/compound' in txt:
        return 'o pedido saiu para <code>groq/compound</code> e voltou um erro da Groq, um serviço de nuvem'
    if 'not found' in txt:
        return 'o Ollama respondeu que o modelo não estava instalado'
    if ws_dead.get(pid):
        return 'a conexão parou de responder ao ping no meio da rodada 1 e caiu'
    primeiro = min(e['timestamp'] for e in reg if e['actorId'] == pid)
    if primeiro > inicio_r3:
        return f'chegou às {hm(primeiro)}, com a última rodada já rodando'
    return 'cadastro trocado antes da primeira rodada'

# ---------------- helpers (linguagem visual dos relatórios anteriores) ----------------
def esc(s): return html.escape(str(s), quote=True)

def extract_svg(content):
    if not content: return None, False
    # Bloco completo que não contém outro '<svg' dentro: modelos que escrevem
    # um tutorial em Markdown às vezes abrem um <svg no meio do texto e só
    # depois entregam o desenho inteiro (clecio e Barbara, na oficina). Pegar
    # do primeiro <svg ao primeiro </svg> engoliria o Markdown junto.
    blocos = re.findall(r'<svg\b(?:(?!<svg\b)[\s\S])*?</svg>', content)
    if blocos: return blocos[-1], False
    m = re.search(r'<svg[\s\S]*', content)
    if not m or '>' not in m.group(0): return None, False
    frag = m.group(0)[:m.group(0).rfind('>')+1]
    if frag.count('<!--') > frag.count('-->'): frag = frag[:frag.rfind('<!--')]
    stack = []
    for tag in re.finditer(r'<(/?)([A-Za-z][\w:-]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)>', frag):
        close, name, attrs = tag.groups()
        if close:
            if name in stack:
                while stack and stack[-1] != name: stack.pop()
                if stack: stack.pop()
        elif not attrs.rstrip().endswith('/'):
            stack.append(name)
    return frag + ''.join(f'</{n}>' for n in reversed(stack)), True

def svg_valido(svg):
    # o <img> só desenha XML válido; atributo repetido, por exemplo, já basta
    # para o navegador desistir (o DPZ, na oficina)
    import xml.dom.minidom
    try: xml.dom.minidom.parseString(svg); return True
    except Exception: return False

def svg_img(content, alt):
    svg, rep = extract_svg(content)
    if not svg: return None, False
    if not svg_valido(svg if 'xmlns' in svg.split('>',1)[0] else svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)):
        return '<div class="cap-bad">SVG inválido: o navegador não consegue desenhar</div>', rep
    if 'xmlns' not in svg.split('>',1)[0]:
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    b64 = base64.b64encode(svg.encode()).decode()
    return f'<img loading="lazy" src="data:image/svg+xml;base64,{b64}" alt="{esc(alt)}">', rep

def nice_ticks(v):
    base = 10 ** math.floor(math.log10(max(v, 4)/4))
    for mult in (1, 2, 2.5, 5, 10):
        if base*mult*4 >= v: return base*mult*4, base*mult
    return v, v/4

def hbar_chart(rows, value_key, tip_fn, color='var(--series-1)', winner_color='var(--series-1-strong)', bar_h=20, gap=10, max_override=None, divs=4):
    if not rows: return ''
    # max_override serve para escalas com teto semântico (nota de 0 a 5),
    # onde os ticks automáticos passariam do máximo possível
    if max_override:
        max_v, tick = max_override, max_override/divs
    else:
        max_v, tick = nice_ticks(max(r[value_key] for r in rows))
    lab_w, val_w, w = 230, 130, 900
    plot_w = w - lab_w - val_w
    h = len(rows)*(bar_h+gap) + 24
    parts = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img">']
    for i in range(1, divs+1):
        x = lab_w + plot_w*i/divs
        parts.append(f'<line x1="{x:.0f}" y1="4" x2="{x:.0f}" y2="{h-20}" class="grid"/>')
    parts.append(f'<line x1="{lab_w}" y1="0" x2="{lab_w}" y2="{h-20}" class="axis"/>')
    for i, r in enumerate(rows):
        y = i*(bar_h+gap)
        bw = max(2, plot_w * r[value_key]/max_v)
        c = winner_color if i == 0 else color
        rr = min(4, bw/2)
        path = f'M{lab_w},{y} h{bw-rr:.1f} a{rr},{rr} 0 0 1 {rr},{rr} v{bar_h-2*rr} a{rr},{rr} 0 0 1 -{rr},{rr} h-{bw-rr:.1f} z'
        nick = r['nick'] if len(r['nick']) <= 24 else r['nick'][:23] + '…'
        parts.append(f'<text x="{lab_w-10}" y="{y+bar_h/2+4}" class="blab" text-anchor="end">{esc(nick)}</text>')
        parts.append(f'<path d="{path}" fill="{c}" class="bar" data-tip="{esc(tip_fn(r))}"/>')
        parts.append(f'<text x="{lab_w+bw+8}" y="{y+bar_h/2+4}" class="bval">{esc(tip_fn(r, short=True))}</text>')
    for i in range(divs+1):
        x = lab_w + plot_w*i/divs
        parts.append(f'<text x="{x:.0f}" y="{h-4}" class="tick" text-anchor="middle">{tick*i:g}</text>')
    parts.append('</svg>')
    return ''.join(parts)

def timeseries_chart(counter, t0, t1, annotations=()):
    def mins(hm): h,m = map(int, hm.split(':')); return h*60+m
    a, b = mins(t0), mins(t1)
    pts = [(mm, counter.get(f'{mm//60:02d}:{mm%60:02d}', 0), f'{mm//60:02d}:{mm%60:02d}') for mm in range(a, b+1)]
    max_v = max(v for _,v,_ in pts) or 1
    W_, H_, padL, padR, padT, padB = 900, 300, 56, 16, 30, 34
    pw, ph = W_-padL-padR, H_-padT-padB
    X = lambda mm: padL + pw*(mm-a)/(b-a)
    Y = lambda v: padT + ph*(1 - v/max_v)
    line = ' '.join(f'{X(mm):.1f},{Y(v):.1f}' for mm,v,_ in pts)
    area = f'{X(a):.1f},{Y(0):.1f} ' + line + f' {X(b):.1f},{Y(0):.1f}'
    parts = [f'<svg class="chart" viewBox="0 0 {W_} {H_}" role="img">']
    _, step = nice_ticks(max_v); step = max(1, int(step))
    for gv in range(0, max_v+step, step):
        if gv > max_v*1.1: break
        parts.append(f'<line x1="{padL}" y1="{Y(gv):.1f}" x2="{W_-padR}" y2="{Y(gv):.1f}" class="grid"/>')
        parts.append(f'<text x="{padL-8}" y="{Y(gv)+4:.1f}" class="tick" text-anchor="end">{gv}</text>')
    for mm in range(a, b+1):
        if mm % 30 == 0:
            parts.append(f'<text x="{X(mm):.1f}" y="{H_-8}" class="tick" text-anchor="middle">{mm//60:02d}:{mm%60:02d}</text>')
    parts.append(f'<polygon points="{area}" class="area"/>')
    parts.append(f'<polyline points="{line}" class="line"/>')
    for label, hm, dy in annotations:
        x = X(mins(hm))
        anchor = 'end' if mins(hm) > (a+b)/2 else 'start'
        xoff = -6 if anchor == 'end' else 6
        parts.append(f'<line x1="{x:.1f}" y1="{padT-6}" x2="{x:.1f}" y2="{H_-padB}" class="ann"/>')
        parts.append(f'<text x="{x+xoff:.1f}" y="{padT+dy}" class="annlab" text-anchor="{anchor}">{esc(label)}</text>')
    for mm, v, hm in pts:
        if v: parts.append(f'<circle cx="{X(mm):.1f}" cy="{Y(v):.1f}" r="9" class="hit" data-tip="{hm}: {v} requisições/min"/>')
    parts.append(f'<line x1="{padL}" y1="{Y(0):.1f}" x2="{W_-padR}" y2="{Y(0):.1f}" class="axis"/>')
    parts.append('</svg>')
    return ''.join(parts)

# ---------------- montagem ----------------
def br(x, casas=1): return f'{x:.{casas}f}'.replace('.', ',')  # decimal com vírgula na prosa
def mediana(xs): xs = sorted(xs); return xs[len(xs)//2] if xs else 0

charts = {
 'activity': timeseries_chart(req_ext, '08:50', '11:30', [
    ('sessão aberta', '08:52', 14),
    ('hotspot', '10:25', 44),
    ('túnel ngrok', '10:42', 74),
 ]),
}

# velocidade: mediana de tokens/s de cada um nas rodadas em que gerou
vel = collections.defaultdict(list); vel_mod = {}
for ms in mets.values():
    for r in ms:
        if r['tokens'] > 0:
            vel[r['nick'].strip()].append(r['tps']); vel_mod[r['nick'].strip()] = (r['real'] or r['model']).strip()
vel_rows = sorted(({'nick': n, 'total': mediana(v), 'model': vel_mod[n], 'n': len(v)} for n, v in vel.items()), key=lambda r: -r['total'])
def vtip(r, short=False):
    return f"{r['total']:.0f} tok/s" if short else f"{r['nick']} ({r['model']}): mediana de {r['total']:.1f} tokens/s em {r['n']} rodada(s)"
charts['vel'] = hbar_chart(vel_rows, 'total', vtip)

tiles = [
 (len(pessoas), 'apelidos cadastrados'),
 (len(no_telao), 'chegaram ao telão'),
 (f'{espera_min // 60}h{espera_min % 60:02d}', 'da sessão aberta à 1ª conexão'),
 (len(rounds), 'rodadas de SVG'),
 (geracoes, 'gerações'),
 (len(modelos_gerou), 'modelos que desenharam'),
 (total_votes, 'votos'),
 (c429, 'rate limits'),
]
tiles_html = ''.join(f'<div class="tile"><div class="tile-v">{v}</div><div class="tile-l">{l}</div></div>' for v,l in tiles)

r1, r2, r3 = rounds[1], rounds[2], rounds[3]
timeline = [
 ('08:39', 'Servidor no ar 🔌', 'Banco novo para o encontro, modo evento, protocolo do agente editável pela primeira vez. Nos testes daqui de dentro, tudo respondendo.'),
 (hm(sessao['createdAt']), 'Sessão aberta 🔑', 'PIN na tela. E nada: nenhum notebook da sala consegue abrir a página do participante pelo IP do servidor.'),
 ('09:00-10:24', 'O Wi-Fi que isolava 📵', 'O diagnóstico, feito do próprio Mac: servidor de pé, firewall desligado, portas abertas para a rede, e nenhuma requisição de fora no log. O Mac não enxergava nenhum outro aparelho além do roteador. O Wi-Fi tinha isolamento de clientes: cada aparelho fala com a internet, mas não com o vizinho.'),
 ('10:25', 'Plano B: o hotspot do celular 📱', f'O Mac entra no hotspot e {len(ips_hotspot)} aparelhos chegam ao servidor por ali. Funciona, mas um hotspot aguenta pouca gente, e ninguém chegou a se cadastrar por ele.'),
 (primeiro_tunel.strftime('%H:%M'), 'Plano C: a Arena na internet 🌐', 'Um túnel ngrok expõe a porta 3000 num endereço https público, e um ajuste de seis linhas na página do participante faz o WebSocket seguir o túnel. A sala volta para o Wi-Fi do prédio e entra pela internet.'),
 (f'{hm(reg[0]["timestamp"])}-{hm(r1["startedAt"])}', 'A sala entra 🚪', f'{sum(1 for e in reg if e["timestamp"] < r1["startedAt"])} cadastros em {round((r1["startedAt"] - reg[0]["timestamp"]) / 60000)} minutos.'),
 (hm(r1['startedAt']), 'Rodada 1: a capivara dançando frevo 🐹', f'O clássico do clube, pela terceira vez, mas com limite de {r1["maxTokens"]} tokens. {len(mets[1])} respostas em {round((r1["endedAt"] - r1["startedAt"]) / 1000)} segundos.'),
 (hm(r2['startedAt']), 'Rodada 2: a bandeira de Pernambuco 🚩', f'Agora com {r2["maxTokens"]:,} tokens de limite e cinco minutos de prazo. {len(mets[2])} bandeiras.'.replace(',', '.')),
 (hm(r3['startedAt']), 'Rodada 3: "seja criativo" 🎨', f'Tema livre. {len(mets[3])} desenhos, a rodada com mais gente gerando. A rodada nunca foi encerrada no painel.'),
 (maior_silencio[1].strftime('%H:%M'), 'Silêncio 💤', f'Por {silencio_min} minutos o servidor não recebe nenhuma requisição, nem do próprio telão. Às {maior_silencio[2].strftime("%H:%M")}, {quedas_juntas[1]} conexões caem no mesmo segundo. Tudo indica que o Mac do servidor dormiu.'),
]
timeline_html = ''.join(
 f'<div class="tl-item"><div class="tl-time">{esc(t)}</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">{esc(ti)}</div><div class="tl-desc">{d}</div></div></div>'
 for t, ti, d in timeline)

# ---------------- elenco, com o motivo de quem ficou fora ----------------
roster_html = ''
fora = []
por_nick = collections.defaultdict(list)
for pid, meta in ultimo.items(): por_nick[meta['nickname'].strip()].append((pid, meta))
for nick in pessoas:
    pid, meta = por_nick[nick][-1]
    if gerou[nick]:
        st = f'<div class="who-st ok">desenhou em {gerou[nick]} de {len(rounds)} rodadas</div>'
    else:
        mot = motivo(pid, meta); fora.append((nick, meta['model'], mot))
        st = f'<div class="who-st">{mot}</div>'
    roster_html += (f'<div class="who-card"><div class="who-nick">{esc(nick)}</div>'
                    f'<div class="who-model"><code>{esc(meta["model"].strip())}</code></div>{st}</div>')

# ---------------- galerias ----------------
def galeria(idx):
    out = []
    for r in mets[idx]:
        img, rep = svg_img(r['content'], f'SVG de {r["nick"]}')
        if not img: img = '<div class="cap-bad">nada chegou: 0 tokens</div>'
        nota = ' · truncado, restaurado' if rep else ''
        out.append(f'<figure class="cap"><div class="cap-img">{img}</div><figcaption><strong>{esc(r["nick"].strip())}</strong><br>'
                   f'<span class="cap-meta">{esc((r["real"] or r["model"]).strip())} · {r["tokens"]} tokens · {br(r["dur"]/1000)} s{nota}</span></figcaption></figure>')
    return ''.join(out)
gal = {i: galeria(i) for i in rounds}
def completos(ms): return sum(1 for r in ms if r['content'] and re.search(r'<svg\b[\s\S]*?</svg>', r['content']))
truncados_r1 = sum(1 for r in mets[1] if r['content'] and '<svg' in r['content'] and not re.search(r'<svg\b[\s\S]*?</svg>', r['content']))
no_teto_r1 = sum(1 for r in mets[1] if r['tokens'] >= r1['maxTokens'] * 0.95)

# ---------------- a capivara nas três edições ----------------
def cap_de(conn, where):
    rid, mt = conn.execute(f'SELECT id, maxTokens FROM rounds WHERE {where}').fetchone()
    rows = conn.execute('SELECT generatedContent c, tpsAvg t FROM metrics WHERE roundId=?', (rid,)).fetchall()
    v = conn.execute('SELECT count(*) FROM votes WHERE roundId=?', (rid,)).fetchone()[0]
    full = sum(1 for r in rows if r['c'] and re.search(r'<svg\b[\s\S]*?</svg>', r['c']))
    return {'g': len(rows), 'mt': mt, 'full': full, 'tps': mediana([r['t'] for r in rows if r['t']]), 'v': v}
cap7 = cap_de(db7, "sessionId LIKE '386428e9%' AND \"index\"=1")
capof = cap_de(dbof, "sessionId LIKE '0d57cbbf%' AND \"index\"=2")
cap8 = cap_de(db, '"index"=1')
def pct(a, b): return f'{a} de {b} ({100*a/b:.0f}%)' if b else '0'
comparativo = [
 ('Limite de tokens', cap7['mt'], capof['mt'], cap8['mt']),
 ('Gerações', cap7['g'], capof['g'], cap8['g']),
 ('Desenhos completos', pct(cap7['full'], cap7['g']), pct(capof['full'], capof['g']), pct(cap8['full'], cap8['g'])),
 ('Velocidade mediana', f"{cap7['tps']:.0f} tokens/s", f"{capof['tps']:.0f} tokens/s", f"{cap8['tps']:.0f} tokens/s"),
 ('Votos', cap7['v'], capof['v'], cap8['v']),
]
comp_html = ''.join(f'<tr><td>{a}</td><td class="num">{b}</td><td class="num">{c}</td><td class="num">{d}</td></tr>' for a,b,c,d in comparativo)

# ---------------- curiosidades ----------------
def met(idx, nick): return next(r for r in mets[idx] if r['nick'].strip() == nick)
arthur1 = met(1, 'Arthur')
recusa = arthur1['content'].split('.')[0].replace('**', '')
pedro_erros = [m for _, m in erros.get('pedro-queiroz-jrnd_id', [])]
pedro_mods = [re.search(r"model '([^']+)'", m).group(1) for m in pedro_erros if 'not found' in m]
pedro3 = met(3, 'Pedro Queiroz')
bianca2 = met(2, 'bianca')
filipe_think = [r for ms in mets.values() for r in ms if r['nick'].strip() == 'Filipe' and r['content'].lstrip().startswith('<think>')]
victor = max((r for ms in mets.values() for r in ms), key=lambda r: r['tps'])
victor_volta = [e for e in reg if e['actorId'].startswith('victor') and ts(e['timestamp']).hour >= 14]
bianca1 = met(1, 'bianca')
url_modelo = next(m['model'] for m in ultimo.values() if m['model'].startswith('http'))
erik_typo = next(json.loads(e['metadata'])['model'] for e in reg if json.loads(e['metadata'])['model'].startswith('smolm2'))
curios = [
 ('Não posso. Aqui está.', f'O <code>gemma4:e4b</code> do Arthur abriu a capivara com "{esc(recusa)}." e, logo em seguida, escreveu o SVG mesmo assim. O limite de {r1["maxTokens"]} tokens cortou o desenho no meio.'),
 ('Na terceira, foi', f'O Pedro Queiroz tentou a rodada 1 com <code>{esc(pedro_mods[0])}</code> e a 2 com <code>{esc(pedro_mods[1])}</code>, e o Ollama respondeu nas duas que o modelo não estava instalado. Na rodada 3, com o <code>{esc((pedro3["real"] or "").strip())}</code> já baixado, entregou {pedro3["tokens"]} tokens e um SVG válido.'),
 ('Sure!', f'A bandeira de Pernambuco foi pedida em português. O <code>qwen3:0.6b</code> da bianca respondeu em inglês ("{esc(bianca2["content"][:40])}…"), em {br(bianca2["dur"]/1000)} segundos. Foi o único a fechar a capivara dentro dos {r1["maxTokens"]} tokens: chegou a {bianca1["tokens"]}.'),
 ('Pensando em inglês', f'O modelo do Filipe, um LFM 2.5 com 8 bilhões de parâmetros e só 1 bilhão ativo por token, abriu as {len(filipe_think)} respostas com um bloco <code>&lt;think&gt;</code> em inglês, traduzindo o pedido antes de começar ("The user asks…").'),
 ('O mais rápido', f'O Victor Jiménez rodou um Qwen 3.5 de 4B pelo llama.cpp e bateu {br(victor["tps"])} tokens/s na rodada {next(i for i, ms in mets.items() if victor in ms)}, o recorde do dia. E foi o único a voltar: às {hm(victor_volta[0]["timestamp"])}, de outra rede, ele se conectou de novo pelo túnel, com a sala já vazia.'),
 ('Do erro de digitação à nuvem', f'Um participante se cadastrou com <code>{esc(erik_typo)}</code>, um modelo que não existe, e trocou para o <code>smollm2:135m</code> três minutos depois. Na rodada 1, o modelo de 135 milhões de parâmetros entregou 0 tokens. Nas rodadas 2 e 3, o pedido já saía para <code>groq/compound</code>, que é um modelo de nuvem.'),
 ('Um site no lugar do modelo', f'Num cadastro, o campo de modelo chegou ao servidor como <code>{esc(url_modelo)}</code>, o endereço de um site. As três rodadas terminaram em "Failed to fetch".'),
 ('Uma sala, um endereço', f'Pelo túnel, todo o Wi-Fi do prédio aparecia para o servidor como um único endereço público. No pico, esse endereço fez {pico_ip} requisições em um minuto, longe do limite de 500 por endereço, e o dia terminou com {c429} rate limits.'),
]
curios_html = ''.join(f'<div class="curio"><div class="curio-t">{t}</div><div class="curio-d">{d}</div></div>' for t,d in curios)

_jv1 = met(1, 'jvras')['content']; _jv1 = _jv1[_jv1.find('<svg'):]
assert not re.search(r'<(rect|circle|ellipse|path|polygon|line|text|g)\b', _jv1)  # só <defs>
jv1_grad = len(re.findall(r'<linearGradient\b', _jv1))
lim2 = f"{r2['maxTokens']:,}".replace(',', '.')  # milhar com ponto
fora_falha = sum(1 for _, _, m in fora if 'Failed to fetch' in m)

# As bandeiras, lidas no código de cada SVG. Os asserts garantem que a
# descrição continua batendo com o banco se o gerador rodar de novo.
svg2 = {r['nick'].strip(): extract_svg(r['content'])[0] for r in mets[2]}
assert re.search(r'<rect x="0" y="0" width="800" height="600"[^>]*fill="white"/>\s*</svg>', svg2['jvras'])
assert 'Brasília' in svg2['bianca'] and len(re.findall(r'<rect width="100%" height="100px"', svg2['Arthur'])) == 3
assert '<circle' in svg2['Filipe'] and 'Estrela' in svg2['Filipe']
FLAGS = f'''<div class="card" style="margin-top:14px">
<p style="font-size:14.5px;color:var(--ink-2)"><strong>"Sem erros."</strong> A bandeira de Pernambuco tem um retângulo azul em cima, com arco-íris, estrela e sol, e um branco embaixo, com uma cruz vermelha. Nenhum modelo chegou lá, e o código explica o que se vê. O <code>qwen3.5:2b</code> do jvras desenhou um círculo azul e enfeites, e no fim acrescentou uma "borda da bandeira": um retângulo branco do tamanho da imagem, por cima de tudo. O <code>gemma4:e4b</code> do Arthur planejou três faixas, vermelha, branca e verde, mas pôs as três no mesmo lugar: só a verde aparece, com um brasão vermelho por cima. O do Victor, o mais trabalhado, é um disco branco com escudos sobre fundo azul. O <code>qwen3:0.6b</code> da bianca desenhou um mapa e marcou a capital: Brasília. O que mais se aproxima é o do Filipe, um campo azul com uma "estrela amarela", segundo o comentário do próprio código, que na verdade é um círculo.</p>
</div>'''

CSS = r'''<style>
:root {
  --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --series-1:#2a78d6; --series-1-strong:#1c5cab; --series-1-soft:#cde2fb; --series-2:#1baf7a;
}
@media (prefers-color-scheme: dark) { :root {
  --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --series-1:#3987e5; --series-1-strong:#6da7ec; --series-1-soft:#184f95; --series-2:#199e70;
} }
:root[data-theme="light"] { --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --series-1:#2a78d6; --series-1-strong:#1c5cab; --series-1-soft:#cde2fb; --series-2:#1baf7a; }
:root[data-theme="dark"] { --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781; --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --series-1:#3987e5; --series-1-strong:#6da7ec; --series-1-soft:#184f95; --series-2:#199e70; }
* { box-sizing:border-box; margin:0; }
body { background:var(--page); color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.55; }
.wrap { max-width:980px; margin:0 auto; padding:32px 20px 80px; }
header.hero { padding:56px 0 28px; }
.kicker { text-transform:uppercase; letter-spacing:.14em; font-size:13px; font-weight:700; color:var(--series-1); }
h1 { font-size:clamp(30px,5vw,46px); line-height:1.12; margin:10px 0 8px; }
.sub { color:var(--ink-2); font-size:17px; max-width:66ch; }
h2 { font-size:24px; margin:56px 0 6px; }
.lede { color:var(--ink-2); margin-bottom:18px; max-width:70ch; }
.card { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:20px; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:20px; }
.tile { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:14px 16px; }
.tile-v { font-size:30px; font-weight:750; letter-spacing:-.01em; }
.tile-l { color:var(--muted); font-size:13px; margin-top:2px; }
.chart { width:100%; height:auto; display:block; }
.chart .grid { stroke:var(--grid); stroke-width:1; }
.chart .axis { stroke:var(--axis); stroke-width:1; }
.chart .tick { fill:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.chart .blab { fill:var(--ink-2); font-size:13px; }
.chart .bval { fill:var(--ink); font-size:12.5px; font-weight:650; font-variant-numeric:tabular-nums; }
.chart .bar:hover { opacity:.82; }
.chart .line { fill:none; stroke:var(--series-1); stroke-width:2; stroke-linejoin:round; }
.chart .area { fill:var(--series-1-soft); opacity:.55; }
.chart .ann { stroke:var(--muted); stroke-width:1; stroke-dasharray:3 4; }
.chart .annlab { fill:var(--ink-2); font-size:12px; font-weight:650; }
.chart .hit { fill:transparent; }
.chart .hit:hover { fill:var(--series-1); }
.worldframe { width:100%; height:auto; display:block; border-radius:12px; }
.tl-item { display:grid; grid-template-columns:110px 18px 1fr; gap:0 14px; padding:0 0 26px; position:relative; }
.tl-item:not(:last-child):before { content:""; position:absolute; left:calc(110px + 14px + 8px); top:16px; bottom:-4px; width:2px; background:var(--grid); }
.tl-time { color:var(--muted); font-size:13px; font-weight:650; text-align:right; padding-top:2px; font-variant-numeric:tabular-nums; }
.tl-dot { width:12px; height:12px; border-radius:50%; background:var(--series-1); margin-top:5px; position:relative; z-index:1; box-shadow:0 0 0 3px var(--page); }
.tl-title { font-weight:700; }
.tl-desc { color:var(--ink-2); font-size:15px; margin-top:2px; max-width:66ch; }
.gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:14px; margin-top:16px; }
.cap { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
.cap-img { background:#fff; aspect-ratio:1; display:flex; align-items:center; justify-content:center; padding:8px; }
.cap-img img { max-width:100%; max-height:100%; }
.cap figcaption { padding:10px 12px 12px; font-size:14px; }
.cap-rank { font-size:13px; }
.cap-meta { color:var(--muted); font-size:12.5px; }
table.cmp { width:100%; border-collapse:collapse; font-size:15px; }
table.cmp th, table.cmp td { padding:9px 12px; text-align:left; border-bottom:1px solid var(--grid); }
table.cmp th { color:var(--muted); font-size:12.5px; text-transform:uppercase; letter-spacing:.06em; }
table.cmp .num { font-variant-numeric:tabular-nums; }
table.cmp .ok { color:#0a7a2f; font-weight:650; }
table.matrix .who { color:var(--muted); font-size:12px; }
table.matrix .muted { color:var(--muted); }
table.matrix td, table.matrix th { white-space:nowrap; }
@media (prefers-color-scheme: dark) { table.cmp .ok { color:#54d97c; } }
.falas { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; margin-top:16px; }
.fala { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
.fala-t { font-weight:700; margin-bottom:8px; font-size:15px; }
.fala blockquote { margin:0; padding-left:14px; border-left:3px solid var(--series-1); color:var(--ink-2); font-size:14.5px; font-style:italic; }
.roster { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; margin-top:16px; }
.who-card { background:var(--surface-1); border:1px solid var(--border); border-radius:10px; padding:12px 14px; }
.who-nick { font-weight:700; font-size:15px; }
.who-model { margin-top:4px; }
.who-model code { font-size:11.5px; }
.who-runner { color:var(--muted); font-size:12px; margin-top:3px; }
.curios { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-top:16px; }
.curio { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:16px; }
.curio-t { font-weight:700; margin-bottom:4px; }
.curio-d { color:var(--ink-2); font-size:14.5px; }
code { background:var(--grid); border-radius:4px; padding:1px 5px; font-size:.9em; }
footer { margin-top:64px; color:var(--muted); font-size:13.5px; border-top:1px solid var(--grid); padding-top:16px; }
#tip { position:fixed; pointer-events:none; background:var(--ink); color:var(--page); padding:6px 10px; border-radius:7px; font-size:13px; max-width:340px; opacity:0; transition:opacity .1s; z-index:10; }
#themeBtn { position:fixed; top:14px; right:14px; background:var(--surface-1); color:var(--ink); border:1px solid var(--border); border-radius:20px; padding:6px 14px; font-size:13px; cursor:pointer; }
@media print { #themeBtn { display:none; } }
.answers { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; margin-top:16px; }
.cap-bad { color:#6b6a65; font-size:13px; text-align:center; padding:0 18px; }
.ans { background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:14px 16px; border-left:4px solid var(--series-2); }
.ans.err { border-left-color:#d4513a; }
.ans-h { font-size:14px; font-weight:650; margin-bottom:8px; }
.ans-s { font-size:12.5px; color:var(--muted); margin-right:4px; }
.ans blockquote { margin:0; color:var(--ink-2); font-size:14px; }
.ans-m { color:var(--muted); font-size:12px; margin-top:8px; }
.proto { font-family:ui-monospace,monospace; font-size:13.5px; background:var(--grid); border-radius:8px; padding:12px 14px; white-space:pre-wrap; margin:12px 0; }
.proto mark { background:#ffd34d; color:#0b0b0b; border-radius:3px; padding:0 3px; }
.who-st { color:var(--muted); font-size:12.5px; margin-top:6px; }
.who-st.ok { color:var(--series-2); font-weight:650; }
</style>
'''

JS = r'''<script>
const tip = document.getElementById('tip');
document.addEventListener('mousemove', e => {
  const t = e.target.closest('[data-tip]');
  if (t) {
    tip.textContent = t.dataset.tip; tip.style.opacity = 1;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10);
    tip.style.left = x + 'px'; tip.style.top = (e.clientY + 16) + 'px';
  } else tip.style.opacity = 0;
});
function tgl() {
  const r = document.documentElement;
  const cur = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  r.dataset.theme = cur === 'dark' ? 'light' : 'dark';
}
</script>
'''

page = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gambiarra Arena · 8º encontro (24/10/2026)</title>
@@CSS@@
</head>
<body>
<button id="themeBtn" onclick="tgl()">◐ tema</button>
<div id="tip"></div>
<div class="wrap">

<header class="hero">
  <div class="kicker">Gambiarra LLM Club · 8º encontro · 24 de outubro de 2026 · Sala Pontes, Porto Digital</div>
  <h1>A Arena que precisou dar a volta pela internet</h1>
  <p class="sub">Relatório do 8º encontro, reconstruído dos registros do servidor. O Wi-Fi do prédio não deixava os notebooks se enxergarem, e a sala passou {espera_min // 60}h{espera_min % 60:02d} sem conseguir abrir a Arena que estava a poucos metros. Quando entrou, foi por um túnel na internet. Daí em diante: <strong>{len(pessoas)} apelidos</strong>, <strong>3 rodadas de SVG</strong> e <strong>{geracoes} gerações</strong> de {len(no_telao)} pessoas que conseguiram chegar ao telão.</p>
  <div class="tiles">{tiles_html}</div>
</header>

<h2>A manhã, minuto a minuto</h2>
<p class="lede">Requisições que chegaram ao servidor vindas de fora do próprio Mac. O encontro começou às 9h; durante quase duas horas a linha fica no chão, porque nada de fora chegava. O pequeno degrau das 10h25 é o hotspot do celular. Depois do túnel, às {primeiro_tunel.strftime('%H:%M')}, a sala entra de uma vez, com pico de {max(req_ext.values())} requisições por minuto.</p>
<div class="card">{charts['activity']}</div>

<h2>Linha do tempo</h2>
<div style="margin-top:20px">{timeline_html}</div>

<h2>📵 O Wi-Fi que não deixava ninguém se ver</h2>
<p class="lede">A Arena é feita para rede local: o servidor roda num notebook e todo mundo se conecta pelo IP dele. Neste encontro isso não funcionou, e o motivo não estava na Arena.</p>
<div class="card">
<table class="cmp">
<tr><th>Tentativa</th><th>O que aconteceu</th></tr>
<tr><td>IP do servidor no Wi-Fi do prédio</td><td>Nenhuma requisição de fora no log. O Mac não enxergava nenhum aparelho da rede além do roteador: o Wi-Fi isolava os clientes.</td></tr>
<tr><td>Hotspot do celular</td><td>{len(ips_hotspot)} aparelhos chegaram ao servidor. Funciona, mas um celular aguenta poucos aparelhos, e ninguém se cadastrou por ali.</td></tr>
<tr><td>Túnel ngrok para a porta 3000</td><td>A sala inteira entrou pelo endereço https público, de qualquer rede. {len(ips_tunel)} endereços diferentes, a maior parte vinda do Wi-Fi do próprio prédio.</td></tr>
</table>
</div>
<p class="lede" style="margin-top:14px">O túnel pediu uma mudança no código, feita ali mesmo: a página do participante montava o endereço do WebSocket sempre na porta 3000, e o túnel só atende na porta padrão do https. Agora, quando a página chega por https, ela conecta em <code>wss://endereço/ws</code>; pelo IP local tudo continua igual. A mudança está no repositório. A votação não passou pelo túnel, porque o telão roda em outra porta.</p>

<h2>👥 Todo mundo que esteve aqui</h2>
<p class="lede">O elenco, em ordem alfabética, com o último modelo cadastrado e o que aconteceu com cada um. {len(no_telao)} de {len(pessoas)} chegaram ao telão. Dos que ficaram de fora, {fora_falha} esbarraram em "Failed to fetch": o navegador não conseguiu falar com o modelo. Isso costuma ser bloqueio de origem (o Ollama precisa de <code>OLLAMA_ORIGINS="*"</code>), endereço errado do modelo ou, com a página agora em https, um navegador que barra chamadas para <code>http://localhost</code>. O log não diz qual dos três foi.</p>
<div class="roster">{roster_html}</div>

<h2>⚡ Velocidade</h2>
<p class="lede">Tokens por segundo de cada um, mediana das rodadas em que gerou. A velocidade depende do modelo, do programa que o roda e da máquina: o mais rápido do dia foi um Qwen de 4 bilhões de parâmetros pelo llama.cpp, à frente de um Qwen de 600 milhões pelo Ollama.</p>
<div class="card">{charts['vel']}</div>

<h2>🐹 Rodada 1: a capivara dançando frevo</h2>
<p class="lede"><em>"{esc(r1['prompt'])}"</em>, com limite de <strong>{r1['maxTokens']} tokens</strong>. Ficou curto: {no_teto_r1} dos {len(mets[1])} modelos bateram no teto e {truncados_r1} desenhos foram cortados no meio (aparecem restaurados, fechando as tags abertas). O quadro em branco do jvras não é erro da galeria: o modelo gastou o espaço definindo {jv1_grad} degradês e foi cortado antes da primeira forma. Ordem de chegada.</p>
<div class="gallery">{gal[1]}</div>

<h2>🚩 Rodada 2: a bandeira de Pernambuco</h2>
<p class="lede"><em>"{esc(r2['prompt'])}"</em>. O limite subiu para {lim2} tokens e todo mundo terminou. Ordem de chegada.</p>
<div class="gallery">{gal[2]}</div>
@@FLAGS@@

<h2>🎨 Rodada 3: seja criativo</h2>
<p class="lede"><em>"{esc(r3['prompt'])}"</em>. A rodada com mais participantes, {len(mets[3])}, e todos entregaram um SVG que o navegador consegue desenhar. Ordem de chegada.</p>
<div class="gallery">{gal[3]}</div>

<h2>⚖️ A mesma capivara, três vezes</h2>
<p class="lede">O prompt da capivara já rodou no 7º encontro (22/08) e na oficina do Rec'n'Play (30/09), as duas vezes com {cap7['mt']} tokens de limite. Desta vez o limite foi {cap8['mt']}, e a tabela mostra o efeito.</p>
<div class="card">
<table class="cmp"><tr><th>Métrica</th><th>7º encontro</th><th>Oficina</th><th>8º encontro</th></tr>{comp_html}</table>
</div>

<h2>🗳️ A votação que não aconteceu</h2>
<p class="lede">Nas rodadas 1 e 2, a urna abriu e fechou em {' e '.join(f'{s} s' for s in urna_seg)}, e o telão revelou um pódio com todos empatados em zero. A rodada 3 nem chegou a ser encerrada. Não há votos no banco, então este relatório não tem vencedores: as galerias seguem a ordem de chegada.</p>

<h2>🧭 O que ficou para o próximo</h2>
<div class="card">
<p style="font-size:14.5px;color:var(--ink-2)">Este era o primeiro encontro com o <strong>protocolo do agente editável</strong> no World, criado depois da oficina, quando se descobriu que os modelos copiavam o exemplo <code>MOVE: NE</code> e iam para o nordeste. O World não foi jogado, então a pergunta continua aberta: sem a direção no exemplo, o nordeste perde a graça? Ficam também três lições de rede para o próximo encontro: testar o acesso de outro aparelho antes de a sala chegar, levar um plano para o Wi-Fi que isola (roteador próprio ou túnel) e deixar o Mac sem dormir (<code>caffeinate</code>).</p>
</div>

<h2>Curiosidades</h2>
<div class="curios">{curios_html}</div>

<footer>
  <p><strong>Fontes:</strong> banco <code>dev-2026-10-24.db</code> (sessão {S_ID}; {len(ultimo)} cadastros com {len(pessoas)} apelidos, {len(rounds)} rodadas, {geracoes} gerações, {total_votes} votos, {len(ev)} eventos) e log estruturado <code>server-2026-10-24.log</code> ({total_req_ext} requisições vindas de fora do Mac, de {len(ips_ext)} endereços; {boots} inicialização do servidor). Comparações da capivara: bancos <code>dev-2026-08-22.db</code> e <code>dev-2026-09-30-recnplay.db</code>. <strong>Recorte:</strong> 24/10, até as 15h; o servidor ficou no ar até 27/10, só com o telão parado. Os motivos de quem ficou fora do telão vêm das mensagens de erro que o navegador de cada um mandou ao servidor. Relatório gerado em {datetime.date.today().strftime('%d/%m/%Y')}. 🐹🤖</p>
</footer>
</div>

@@JS@@
</body>
</html>'''

page = page.replace('@@CSS@@', CSS).replace('@@JS@@', JS).replace('@@FLAGS@@', FLAGS)
with open(OUT, 'w') as f:
    f.write(page)
print('OK:', OUT, f'{len(page)/1024:.0f} KB | gerações: {geracoes} | no telão: {len(no_telao)} | fora: {len(fora)}')
