#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera o relatório HTML do 6º encontro (11/07/2026) a partir do banco
dev-2026-07-11.db e do log do servidor. Tema: agentes de código com modelos
abertos e locais + estreia do prompt customizável no World."""
import sqlite3, json, re, base64, html, collections, datetime, os, math

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(REPO, 'server/prisma/dev-2026-07-11.db')
LOG = os.path.join(REPO, 'server/logs/server-2026-07-11.log')
OUT = os.path.join(REPO, 'docs/reports/encontro-2026-07-11.html')

db = sqlite3.connect(DB)
db.row_factory = sqlite3.Row

S_MAIN = '140a7e40'   # sessão principal (rodadas 1-2)
S_FINAL = '2c7cf882'  # sessão final (rodada 3)

# Recorte do relatório: dados a partir das 9h — antes disso, testes internos
# do organizador. Entre ~10h e 11h houve teste de OUTRA plataforma (bots de
# Minecraft, de Jonathas Vinicius), fora do escopo deste relatório.
CUT9 = int(datetime.datetime(2026, 7, 11, 9, 0).timestamp() * 1000)

# ---------------- dados ----------------
def votes_for(sess_prefix, idx):
    return db.execute("""
      SELECT p.nickname nick, p.model model, count(*) n, avg(v.score) avg, sum(v.score) total
      FROM votes v JOIN rounds r ON v.roundId=r.id JOIN participants p ON v.participantId=p.id
      WHERE r.sessionId LIKE ?||'%' AND r."index"=? GROUP BY p.id ORDER BY total DESC, avg DESC""",
      (sess_prefix, idx)).fetchall()

def metrics_for(sess_prefix, idx):
    return db.execute("""
      SELECT p.nickname nick, p.model model, m.tokens, m.tpsAvg tps, m.generatedContent content
      FROM metrics m JOIN rounds r ON m.roundId=r.id JOIN participants p ON m.participantId=p.id
      WHERE r.sessionId LIKE ?||'%' AND r."index"=? ORDER BY m.tokens DESC""",
      (sess_prefix, idx)).fetchall()

v_r1, v_r2, v_r3 = votes_for(S_MAIN,1), votes_for(S_MAIN,2), votes_for(S_FINAL,1)
m_r1, m_r2, m_r3 = metrics_for(S_MAIN,1), metrics_for(S_MAIN,2), metrics_for(S_FINAL,1)

# participantes do ENCONTRO: ativos após as 9h (world-only ficam em sessões
# antigas pela semântica do upsert, então o filtro é por lastSeen, não sessão)
nicks = db.execute("SELECT count(DISTINCT nickname) FROM participants WHERE lastSeen>=?", (CUT9,)).fetchone()[0]
models = db.execute("SELECT count(DISTINCT model) FROM participants WHERE lastSeen>=?", (CUT9,)).fetchone()[0]
voters, total_votes = db.execute("SELECT count(DISTINCT voterHash), count(*) FROM votes").fetchone()

world_final = json.loads(db.execute("SELECT metadata FROM event_logs WHERE eventType='world_stopped'").fetchone()[0])
world_scores = [s for s in world_final['scores'] if not s['isBot']]

peak_row = db.execute("""SELECT timestamp, metadata FROM event_logs WHERE eventType='world_snapshot'
  ORDER BY json_array_length(json_extract(metadata,'$.agents')) DESC, timestamp LIMIT 1""").fetchone()
peak_state = json.loads(peak_row['metadata'])
peak_time = datetime.datetime.fromtimestamp(peak_row['timestamp']/1000).strftime('%H:%M:%S')

prompt_hackers = db.execute("""
  SELECT json_extract(metadata,'$.nickname') nick, count(*) n
  FROM event_logs WHERE eventType='agent_prompt_changed' AND json_extract(metadata,'$.isDefault')=0
    AND timestamp>=?
  GROUP BY actorId ORDER BY n DESC""", (CUT9,)).fetchall()
total_custom = sum(r['n'] for r in prompt_hackers)
snapshots_count = db.execute("SELECT count(*) FROM event_logs WHERE eventType='world_snapshot' AND timestamp>=?", (CUT9,)).fetchone()[0]

# ---------------- log ----------------
req = collections.Counter(); c429 = 0; dedup = 0; ips = set()
for line in open(LOG):
    try: d = json.loads(line)
    except Exception: continue
    m = d.get('msg','')
    t = datetime.datetime.fromtimestamp(d['time']/1000)
    if t.hour < 9: continue  # recorte: antes das 9h foram testes internos
    if m == 'incoming request': req[t.strftime('%H:%M')] += 1; ips.add(d.get('req',{}).get('remoteAddress'))
    elif m.startswith('HTTP_429'): c429 += 1
    elif m.startswith('WS_DEDUP'): dedup += 1
total_req = sum(req.values()); peak_min, peak_val = req.most_common(1)[0]

# ---------------- helpers (linguagem visual do relatório do 5º encontro) ----------------
def esc(s): return html.escape(str(s), quote=True)

def extract_svg(content):
    if not content: return None, False
    m = re.search(r'<svg[\s\S]*?</svg>', content)
    if m: return m.group(0), False
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

def svg_img(content, alt):
    svg, rep = extract_svg(content)
    if not svg: return None, False
    if 'xmlns' not in svg.split('>',1)[0]:
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    b64 = base64.b64encode(svg.encode()).decode()
    return f'<img loading="lazy" src="data:image/svg+xml;base64,{b64}" alt="{esc(alt)}">', rep

def nice_ticks(v):
    base = 10 ** math.floor(math.log10(max(v, 4)/4))
    for mult in (1, 2, 2.5, 5, 10):
        if base*mult*4 >= v: return base*mult*4, base*mult
    return v, v/4

def hbar_chart(rows, value_key, tip_fn, color='var(--series-1)', winner_color='var(--series-1-strong)', bar_h=20, gap=10):
    if not rows: return ''
    max_v, tick = nice_ticks(max(r[value_key] for r in rows))
    lab_w, val_w, w = 230, 130, 900
    plot_w = w - lab_w - val_w
    h = len(rows)*(bar_h+gap) + 24
    parts = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img">']
    for i in range(1,5):
        x = lab_w + plot_w*i/4
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
    for i in range(5):
        x = lab_w + plot_w*i/4
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
    step = 100 if max_v <= 400 else 250
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
        if v: parts.append(f'<circle cx="{X(mm):.1f}" cy="{Y(v):.1f}" r="9" class="hit" data-tip="{hm} — {v} requisições/min"/>')
    parts.append(f'<line x1="{padL}" y1="{Y(0):.1f}" x2="{W_-padR}" y2="{Y(0):.1f}" class="axis"/>')
    parts.append('</svg>')
    return ''.join(parts)

# ---------------- frame REAL do World (posições dos snapshots!) ----------------
def world_frame_svg(state):
    W, H = state['config']['width'], state['config']['height']
    out = [f'<svg class="worldframe" viewBox="0 0 {W} {H}" role="img" aria-label="Frame real do World">']
    out.append(f'<rect width="{W}" height="{H}" fill="#0A0E27"/>')
    for gx in range(160, W, 160): out.append(f'<line x1="{gx}" y1="0" x2="{gx}" y2="{H}" stroke="rgba(37,43,77,.5)"/>')
    for gy in range(160, H, 160): out.append(f'<line x1="0" y1="{gy}" x2="{W}" y2="{gy}" stroke="rgba(37,43,77,.5)"/>')
    out.append(f'<rect width="{W}" height="{H}" fill="none" stroke="#252B4D" stroke-width="4"/>')
    for f in state['food']:
        out.append(f'<circle cx="{f["x"]}" cy="{f["y"]}" r="9" fill="#39FF14" opacity=".95"/>')
        out.append(f'<circle cx="{f["x"]}" cy="{f["y"]}" r="16" fill="#39FF14" opacity=".18"/>')
    for a in state['agents']:
        x, y, c = a['x'], a['y'], a['color']
        hx, hy = x + 34*math.cos(a['heading']), y + 34*math.sin(a['heading'])
        out.append(f'<line x1="{x}" y1="{y}" x2="{hx:.0f}" y2="{hy:.0f}" stroke="{c}" stroke-width="3" opacity=".5"/>')
        out.append(f'<circle cx="{x}" cy="{y}" r="25" fill="{c}" opacity=".22"/>')
        out.append(f'<circle cx="{x}" cy="{y}" r="25" fill="none" stroke="{c}" stroke-width="4"/>')
        out.append(f'<text x="{x}" y="{y+10}" text-anchor="middle" font-size="30">{a["emoji"]}</text>')
        out.append(f'<text x="{x}" y="{y+52}" text-anchor="middle" font-size="19" font-weight="600" fill="#e8e8e8" font-family="ui-monospace,monospace">{esc(a["nickname"])}  {a["score"]}</text>')
        if a.get('say'):
            say = esc(a['say'][:40])
            out.append(f'<g><rect x="{x-len(a["say"][:40])*5.4-12:.0f}" y="{y-92}" width="{len(a["say"][:40])*10.8+24:.0f}" height="36" rx="10" fill="rgba(26,31,61,.95)" stroke="{c}" stroke-width="2"/>'
                       f'<text x="{x}" y="{y-67}" text-anchor="middle" font-size="20" fill="#fff" font-family="system-ui">{say}</text></g>')
    out.append('</svg>')
    return ''.join(out)

PH_OBJ, PH_RADAR, PH_PROTO = '{{objetivo}}', '{{radar}}', '{{protocolo}}'

# ---------------- matriz modelos × desafios ----------------
# melhor colocação de cada MODELO em cada desafio (com quem o pilotou)
model_by_nick = dict(db.execute("SELECT nickname, model FROM participants"))
# lookup tolerante: 'Bardo-Programador' (world) e 'Bardo Programador' (arena)
# são a mesma pessoa com pontuação diferente no apelido
def _norm(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower())
model_by_norm = {_norm(k): v for k, v in model_by_nick.items()}

def lookup_model(nick):
    return model_by_nick.get(nick) or model_by_norm.get(_norm(nick), '?')

def challenge_ranks(rows, model_key=None):
    out = {}
    for i, r in enumerate(rows):
        m = r[model_key] if model_key else lookup_model(r['nick'])
        if m not in out:
            out[m] = (i + 1, r['nick'])
    return out

world_scored = [{'nick': s['nickname'], 'total': s['score']} for s in world_scores if s['score'] > 0]
matrix_challenges = [
    ('🌍 World', challenge_ranks(world_scored)),
    ('🎨 R1', challenge_ranks(v_r1, 'model')),
    ('🎨 R2', challenge_ranks(v_r2, 'model')),
    ('🎨 R3', challenge_ranks(v_r3, 'model')),
]
all_models = sorted(
    {m for _, ranks in matrix_challenges for m in ranks},
    key=lambda m: (
        -sum(1 for _, ranks in matrix_challenges if ranks.get(m, (99,))[0] == 1),  # ouros
        -sum(1 for _, ranks in matrix_challenges if ranks.get(m, (99,))[0] <= 3),  # pódios
        min(ranks.get(m, (99,))[0] for _, ranks in matrix_challenges),
    ))

def matrix_cell(pos_nick):
    if not pos_nick: return '<td class="num muted">—</td>'
    pos, nick = pos_nick
    face = ['🥇','🥈','🥉'][pos-1] if pos <= 3 else f'{pos}º'
    short = nick if len(nick) <= 16 else nick[:15] + '…'
    return f'<td class="num">{face} <span class="who">{esc(short)}</span></td>'

matrix_html = '<tr><th>Modelo</th>' + ''.join(f'<th>{esc(t)}</th>' for t, _ in matrix_challenges) + '</tr>'
for m in all_models:
    matrix_html += f'<tr><td><code>{esc(m)}</code></td>' + ''.join(matrix_cell(ranks.get(m)) for _, ranks in matrix_challenges) + '</tr>'

# ---------------- montagem ----------------
medal = ['🥇','🥈','🥉']
def rank(i): return medal[i] if i < 3 else f'{i+1}º'

def tip(r, short=False):
    return f"{r['total']} pts" if short else f"{r['nick']} — {r['total']} pts · {r['n']} votos · média {r['avg']:.2f}"

world_rows = [{'nick': s['nickname'], 'total': s['score'], 'n': 0, 'avg': 0} for s in world_scores]
def wtip(r, short=False):
    return f"{r['total']} 🍏" if short else f"{r['nick']} — {r['total']} comidas"

charts = {
 'activity': timeseries_chart(req, '08:55', '13:15', [
    ('≈10h–11h: Minecraft (outro sistema)', '10:10', 14),
    ('World: chegada', '11:08', 44),
    ('fim da partida', '11:30', 74),
    ('R1', '11:39', 104),
    ('R2', '11:50', 34),
    ('R3 + premiação', '12:12', 60),
 ]),
 'world': hbar_chart([r for r in world_rows if r['total'] > 0], 'total', wtip,
                     color='var(--series-2)', winner_color='var(--series-2)'),
 'r2': hbar_chart(v_r2, 'total', tip),
 'r3': hbar_chart(v_r3, 'total', tip),
 'r1': hbar_chart(v_r1, 'total', tip),
}

tiles = [
 (nicks, 'participantes'), (models, 'modelos diferentes'), (len(ips), 'dispositivos na rede'),
 (f'{total_votes}', f'votos de {voters} votantes'),
 (len(peak_state['agents']), f'agentes no pico do World ({peak_time})'),
 (world_scores[0]['score'], f'comidas do campeão ({esc(world_scores[0]["nickname"])})'),
 (total_custom, f'versões de prompt de {len(prompt_hackers)} participantes'),
 ('0', 'rate limits (eram 297 no 5º)'),
]
tiles_html = ''.join(f'<div class="tile"><div class="tile-v">{v}</div><div class="tile-l">{l}</div></div>' for v,l in tiles)

timeline = [
 ('manhã', 'Sobre este recorte 📋', 'Este relatório cobre APENAS a Gambiarra Arena, com dados a partir das 9h (antes disso, testes internos do organizador — que de quebra renderam quatro correções mergeadas antes do público chegar).'),
 ('≈10h–11h', 'Intervalo Minecraft 🎮', 'A turma testou outra plataforma do encontro: o sistema de Jonathas Vinicius que controla bots dentro do Minecraft. Fica registrado o vale no gráfico de tráfego da Arena — os agentes estavam ocupados em outro mundo (literalmente). Cobertura completa fora deste relatório.'),
 ('11:10–11:30', 'World: a partida oficial 🌍', f'Agentes chegando até o pico de {len(peak_state["agents"])} simultâneos às {peak_time}. Desta vez COM comida (14 no mapa) e placar de verdade: Almir devorou 93, shaolin_matador_de_porco 75, amarante 45. Partida encerrada às 11:30 com o placar gravado.'),
 ('11:31', 'Sessão principal', 'PIN novo, todo mundo dentro — e a estreia da dinâmica do tema do dia: o prompt do agente editável ao vivo, valendo no pulso seguinte.'),
 ('11:38', 'Rodada 1 — a capivara clássica', f'{len(m_r1)} gerações, {sum(r["n"] for r in v_r1)} votos. Empate técnico no topo: EngenheiroDaGambiarra e amarante, 36 pts cada (média 2,77).'),
 ('11:49', 'Rodada 2 — a rodada do Almir 👑', f'{len(m_r2)} gerações e a maior média do dia: Almir com 4,08 (53 pts) — no mesmo dia em que venceu o World. Dobradinha histórica.'),
 ('12:07', 'Sessão final + Rodada 3', f'{len(m_r3)} gerações; HUGU vence com média 4,0 e Carangueijo0 leva a prata. Premiação com revelação posição a posição no telão.'),
 ('13:12', 'Luzes apagadas', 'Shutdown gracioso, 634 snapshots do World gravados — pela primeira vez, o mundo inteiro é reconstruível frame a frame.'),
]
timeline_html = ''.join(
 f'<div class="tl-item"><div class="tl-time">{esc(t)}</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">{esc(ti)}</div><div class="tl-desc">{d}</div></div></div>'
 for t, ti, d in timeline)

# galeria: melhores capivaras com SVG
gallery = []
for label, votes, mets in [('R1', v_r1, m_r1), ('R2', v_r2, m_r2), ('R3', v_r3, m_r3)]:
    by_nick = {r['nick']: r for r in mets}
    got = 0
    for i, v in enumerate(votes):
        mrow = by_nick.get(v['nick'])
        if not mrow: continue
        img, rep = svg_img(mrow['content'], f'Capivara de {v["nick"]}')
        if img:
            nota = ' · truncado, restaurado' if rep else ''
            gallery.append(f'<figure class="cap"><div class="cap-img">{img}</div><figcaption><span class="cap-rank">{rank(i)} {label}</span> <strong>{esc(v["nick"])}</strong><br><span class="cap-meta">{esc(mrow["model"])} · {v["total"]} pts · média {v["avg"]:.2f}{nota}</span></figcaption></figure>')
            got += 1
        if got >= 3: break
gallery_html = ''.join(gallery)

prompt_rows = ''.join(f'<tr><td>{esc(r["nick"])}</td><td class="num">{r["n"]}</td></tr>' for r in prompt_hackers)

comparativo = [
 ('Erros 429 (rate limit)', '297', '0 ✅'),
 ('Pico de requisições/min', '934', f'{peak_val}'),
 ('Requisições HTTP no dia', '10.396', f'{total_req:,}'.replace(',','.')),
 ('Telão piscando (flicker)', 'sim, na votação', 'nenhum relato'),
 ('Reconexões absorvidas (dedup)', '336', f'{dedup}'),
 ('World reconstruível depois?', 'só por aproximação', f'{snapshots_count} snapshots completos'),
]
comp_html = ''.join(f'<tr><td>{a}</td><td class="num">{b}</td><td class="num ok">{c}</td></tr>' for a,b,c in comparativo)

curios = [
 ('A guerra dos apelidos', 'No World jogou o <b>shaolin_matador_de_porco</b> (75 comidas, 🥈). Nas rodadas de capivara apareceu o <b>porco_matador_de_shaolin</b>. O clube aguarda o desempate no 7º encontro.'),
 ('A dobradinha do Almir', 'Venceu o World (93 comidas) E a rodada 2 da capivara (média 4,08) — usando o prompt padrão do agente. A lição do dia: template ajuda, mas estratégia ganha jogo.'),
 ('O prompt dentro das chaves', 'FlavinduPneu iterou 12 versões de prompt e inventou placeholders próprios: <code>{{seja rapido e evite as bordas do mapa}}</code>. Foi literal para o modelo — e os guarda-corpos mantiveram o agente andando mesmo assim. 20 comidas!'),
 ('A edição minimalista', 'A única mudança do shaolin no template foi apagar uma linha em branco. 75 comidas. Menos é mais.'),
 ('Erik Reis (INSTALEM O FLASH BUS)', 'O merchan no apelido persiste desde o 5º encontro. Duas comidas no World e lanterna nas capivaras — mas a mensagem foi entregue.'),
 ('O organizador viciou', 'calegario fez 15 versões de prompt durante o evento — o maior número do dia. A dinâmica foi aprovada pelo próprio autor.'),
]
curios_html = ''.join(f'<div class="curio"><div class="curio-t">{t}</div><div class="curio-d">{d}</div></div>' for t,d in curios)

world_svg = world_frame_svg(peak_state)

page = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gambiarra Arena — 6º Encontro (11/07/2026)</title>
<style>
:root {{
  --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --series-1:#2a78d6; --series-1-strong:#1c5cab; --series-1-soft:#cde2fb; --series-2:#1baf7a;
}}
@media (prefers-color-scheme: dark) {{ :root {{
  --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --series-1:#3987e5; --series-1-strong:#6da7ec; --series-1-soft:#184f95; --series-2:#199e70;
}} }}
:root[data-theme="light"] {{ --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --series-1:#2a78d6; --series-1-strong:#1c5cab; --series-1-soft:#cde2fb; --series-2:#1baf7a; }}
:root[data-theme="dark"] {{ --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781; --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --series-1:#3987e5; --series-1-strong:#6da7ec; --series-1-soft:#184f95; --series-2:#199e70; }}
* {{ box-sizing:border-box; margin:0; }}
body {{ background:var(--page); color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.55; }}
.wrap {{ max-width:980px; margin:0 auto; padding:32px 20px 80px; }}
header.hero {{ padding:56px 0 28px; }}
.kicker {{ text-transform:uppercase; letter-spacing:.14em; font-size:13px; font-weight:700; color:var(--series-1); }}
h1 {{ font-size:clamp(30px,5vw,46px); line-height:1.12; margin:10px 0 8px; }}
.sub {{ color:var(--ink-2); font-size:17px; max-width:66ch; }}
h2 {{ font-size:24px; margin:56px 0 6px; }}
.lede {{ color:var(--ink-2); margin-bottom:18px; max-width:70ch; }}
.card {{ background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:20px; }}
.tiles {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:20px; }}
.tile {{ background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:14px 16px; }}
.tile-v {{ font-size:30px; font-weight:750; letter-spacing:-.01em; }}
.tile-l {{ color:var(--muted); font-size:13px; margin-top:2px; }}
.chart {{ width:100%; height:auto; display:block; }}
.chart .grid {{ stroke:var(--grid); stroke-width:1; }}
.chart .axis {{ stroke:var(--axis); stroke-width:1; }}
.chart .tick {{ fill:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }}
.chart .blab {{ fill:var(--ink-2); font-size:13px; }}
.chart .bval {{ fill:var(--ink); font-size:12.5px; font-weight:650; font-variant-numeric:tabular-nums; }}
.chart .bar:hover {{ opacity:.82; }}
.chart .line {{ fill:none; stroke:var(--series-1); stroke-width:2; stroke-linejoin:round; }}
.chart .area {{ fill:var(--series-1-soft); opacity:.55; }}
.chart .ann {{ stroke:var(--muted); stroke-width:1; stroke-dasharray:3 4; }}
.chart .annlab {{ fill:var(--ink-2); font-size:12px; font-weight:650; }}
.chart .hit {{ fill:transparent; }}
.chart .hit:hover {{ fill:var(--series-1); }}
.worldframe {{ width:100%; height:auto; display:block; border-radius:12px; }}
.tl-item {{ display:grid; grid-template-columns:110px 18px 1fr; gap:0 14px; padding:0 0 26px; position:relative; }}
.tl-item:not(:last-child):before {{ content:""; position:absolute; left:calc(110px + 14px + 8px); top:16px; bottom:-4px; width:2px; background:var(--grid); }}
.tl-time {{ color:var(--muted); font-size:13px; font-weight:650; text-align:right; padding-top:2px; font-variant-numeric:tabular-nums; }}
.tl-dot {{ width:12px; height:12px; border-radius:50%; background:var(--series-1); margin-top:5px; position:relative; z-index:1; box-shadow:0 0 0 3px var(--page); }}
.tl-title {{ font-weight:700; }}
.tl-desc {{ color:var(--ink-2); font-size:15px; margin-top:2px; max-width:66ch; }}
.gallery {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:14px; margin-top:16px; }}
.cap {{ background:var(--surface-1); border:1px solid var(--border); border-radius:12px; overflow:hidden; }}
.cap-img {{ background:#fff; aspect-ratio:1; display:flex; align-items:center; justify-content:center; padding:8px; }}
.cap-img img {{ max-width:100%; max-height:100%; }}
.cap figcaption {{ padding:10px 12px 12px; font-size:14px; }}
.cap-rank {{ font-size:13px; }}
.cap-meta {{ color:var(--muted); font-size:12.5px; }}
table.cmp {{ width:100%; border-collapse:collapse; font-size:15px; }}
table.cmp th, table.cmp td {{ padding:9px 12px; text-align:left; border-bottom:1px solid var(--grid); }}
table.cmp th {{ color:var(--muted); font-size:12.5px; text-transform:uppercase; letter-spacing:.06em; }}
table.cmp .num {{ font-variant-numeric:tabular-nums; }}
table.cmp .ok {{ color:#0a7a2f; font-weight:650; }}
table.matrix .who {{ color:var(--muted); font-size:12px; }}
table.matrix .muted {{ color:var(--muted); }}
table.matrix td, table.matrix th {{ white-space:nowrap; }}
@media (prefers-color-scheme: dark) {{ table.cmp .ok {{ color:#54d97c; }} }}
.curios {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-top:16px; }}
.curio {{ background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:16px; }}
.curio-t {{ font-weight:700; margin-bottom:4px; }}
.curio-d {{ color:var(--ink-2); font-size:14.5px; }}
code {{ background:var(--grid); border-radius:4px; padding:1px 5px; font-size:.9em; }}
footer {{ margin-top:64px; color:var(--muted); font-size:13.5px; border-top:1px solid var(--grid); padding-top:16px; }}
#tip {{ position:fixed; pointer-events:none; background:var(--ink); color:var(--page); padding:6px 10px; border-radius:7px; font-size:13px; max-width:340px; opacity:0; transition:opacity .1s; z-index:10; }}
#themeBtn {{ position:fixed; top:14px; right:14px; background:var(--surface-1); color:var(--ink); border:1px solid var(--border); border-radius:20px; padding:6px 14px; font-size:13px; cursor:pointer; }}
@media print {{ #themeBtn {{ display:none; }} }}
</style>
</head>
<body>
<button id="themeBtn" onclick="tgl()">◐ tema</button>
<div id="tip"></div>
<div class="wrap">

<header class="hero">
  <div class="kicker">Gambiarra LLM Club · 6º Encontro · Agentes de código com modelos abertos e locais</div>
  <h1>O dia em que o prompt virou jogo</h1>
  <p class="sub">Relatório do encontro de <strong>11 de julho de 2026</strong>, reconstruído dos registros do servidor central. {nicks} participantes, {models} modelos locais, uma partida de World com placar de verdade, três capivaras dançando frevo — e a estreia da engenharia de prompt ao vivo: editar o cérebro do agente e ver o efeito no pulso seguinte. <em>Este relatório cobre apenas a Gambiarra Arena (dados a partir das 9h); o teste da plataforma de bots no Minecraft, de Jonathas Vinicius, aconteceu entre ~10h e 11h e merece registro próprio.</em></p>
  <div class="tiles">{tiles_html}</div>
</header>

<h2>O dia, minuto a minuto</h2>
<p class="lede">Tráfego HTTP no servidor central. Compare a escala com o 5º encontro: o estado agora viaja por WebSocket, e o pico caiu de 934 para {peak_val} requisições/min — sem um único 429.</p>
<div class="card">{charts['activity']}</div>

<h2>Linha do tempo</h2>
<div style="margin-top:20px">{timeline_html}</div>

<h2>🌍 World — desta vez, com tudo gravado</h2>
<p class="lede">O frame REAL do pico ({peak_time}, {len(peak_state['agents'])} agentes, 14 comidas) — posições exatas vindas dos snapshots de 5 s que estrearam hoje. Nada de reconstrução aproximada como no 5º encontro: é o mundo como ele estava.</p>
<div class="card" style="padding:8px">{world_svg}</div>
<p class="lede" style="margin-top:22px">Placar final da partida (comidas coletadas):</p>
<div class="card">{charts['world']}</div>

<h2>🧠 A dinâmica do dia: engenharia de prompt ao vivo</h2>
<p class="lede">Tema do encontro na prática: o prompt do agente virou um template editável (<code>{PH_OBJ}</code>, <code>{PH_RADAR}</code>, <code>{PH_PROTO}</code>…) que vale no pulso seguinte. {len(prompt_hackers)} participantes salvaram {total_custom} versões customizadas — todas gravadas no event log, cruzáveis com os snapshots do World para estudar o que realmente funcionou.</p>
<div class="card">
<table class="cmp"><tr><th>Participante</th><th>versões de prompt</th></tr>{prompt_rows}</table>
</div>

<h2>🤖 A matriz dos modelos</h2>
<p class="lede">Quem venceu cada desafio, por modelo — a melhor colocação que cada um alcançou (e quem o pilotava). Os desafios premiam coisas diferentes: o World exige decisão rápida em loop; as capivaras, capricho visual em SVG.</p>
<div class="card" style="overflow-x:auto">
<table class="cmp matrix">{matrix_html}</table>
</div>

<h2>🏆 Rodada 2 — a rodada do Almir</h2>
<p class="lede">A maior média do dia (4,08) no mesmo dia em que venceu o World. Pontuação = soma dos votos (0–5 por votante).</p>
<div class="card">{charts['r2']}</div>

<h2>Rodada 3 — a vitória do HUGU</h2>
<div class="card">{charts['r3']}</div>

<h2>Rodada 1 — o empate técnico</h2>
<div class="card">{charts['r1']}</div>

<h2>Galeria de capivaras</h2>
<p class="lede">O pódio de cada rodada, exatamente como saiu dos modelos — SVGs gerados token a token em notebooks.</p>
<div class="gallery">{gallery_html}</div>

<h2>⚙️ 5º vs 6º encontro — as correções em campo</h2>
<p class="lede">O pacote de estabilidade (push por WebSocket, anti-flicker, clientes modularizados) foi testado hoje com plateia. O placar:</p>
<div class="card">
<table class="cmp"><tr><th>Métrica</th><th>5º (23/05)</th><th>6º (11/07)</th></tr>{comp_html}</table>
</div>

<h2>Curiosidades</h2>
<div class="curios">{curios_html}</div>

<footer>
  <p><strong>Fontes:</strong> banco <code>dev-2026-07-11.db</code> (sessões, rodadas, métricas, votos, event log com {snapshots_count} world_snapshots e {total_custom} prompts customizados), log estruturado <code>server-2026-07-11.log</code> e snapshots de sessão. <strong>Recorte:</strong> dados a partir das 9h (antes: testes internos); somente a Gambiarra Arena — o teste da plataforma de bots no Minecraft (Jonathas Vinicius, ~10h–11h) não está coberto aqui. Relatório gerado em 11/07/2026. 🐹🤖</p>
</footer>
</div>

<script>
const tip = document.getElementById('tip');
document.addEventListener('mousemove', e => {{
  const t = e.target.closest('[data-tip]');
  if (t) {{
    tip.textContent = t.dataset.tip; tip.style.opacity = 1;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10);
    tip.style.left = x + 'px'; tip.style.top = (e.clientY + 16) + 'px';
  }} else tip.style.opacity = 0;
}});
function tgl() {{
  const r = document.documentElement;
  const cur = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  r.dataset.theme = cur === 'dark' ? 'light' : 'dark';
}}
</script>
</body>
</html>'''

with open(OUT, 'w') as f:
    f.write(page)
print('OK:', OUT, f'{len(page)/1024:.0f} KB | galeria: {len(gallery)} | world agents: {len(peak_state["agents"])}')
