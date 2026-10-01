#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera o relatório HTML da oficina "IA sem nuvem" no Rec'n'Play (30/09/2026)
a partir do banco dev-2026-09-30-recnplay.db e do log do servidor. Não foi um
encontro do clube: foi uma oficina de 3 horas para iniciantes que terminou com
a sala inteira na Arena. Tema central do relatório: os modelos copiaram o
exemplo do protocolo do World ("MOVE: NE | indo atrás da comida") e foram
parar no nordeste."""
import sqlite3, json, re, base64, html, collections, datetime, os, math, hashlib

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(REPO, 'server/prisma/dev-2026-09-30-recnplay.db')
DB_7 = os.path.join(REPO, 'server/prisma/dev-2026-08-22.db')  # 7º encontro, para comparar a capivara
LOG = os.path.join(REPO, 'server/logs/server-2026-09-30.log')
OUT = os.path.join(REPO, 'docs/reports/oficina-2026-09-30.html')

# immutable=1: leitura sem tocar no arquivo (o mode=ro falha em banco WAL
# sem os arquivos -wal/-shm, ver docs/reports/README.md)
db = sqlite3.connect(f'file:{DB}?immutable=1', uri=True)
db.row_factory = sqlite3.Row
db7 = sqlite3.connect(f'file:{DB_7}?immutable=1', uri=True)
db7.row_factory = sqlite3.Row

S_DESAFIO = '0d57cbbf'  # 11:02, rodadas 1 (capital de PE) e 2 (capivara)
S_WORLD = '7c1b72a9'    # 11:41, só World até o fim

# O log de 30/09 também tem o ensaio da véspera (o servidor grava em UTC e
# passou da meia-noite). A oficina começa às 9h; tudo antes disso fica fora.
DAY_START = datetime.datetime(2026, 9, 30, 8, 0)

# ---------------- dados ----------------
def votes_for(sess_prefix, idx):
    return db.execute("""
      SELECT p.nickname nick, p.model model, count(*) n, avg(v.score) avg, sum(v.score) total
      FROM votes v JOIN rounds r ON v.roundId=r.id JOIN participants p ON v.participantId=p.id
      WHERE r.sessionId LIKE ?||'%' AND r."index"=? GROUP BY p.id ORDER BY avg DESC, total DESC""",
      (sess_prefix, idx)).fetchall()

def metrics_for(sess_prefix, idx):
    # 'model' é o que a pessoa cadastrou; 'real' é o que de fato gerou
    return db.execute("""
      SELECT p.nickname nick, p.model model, json_extract(m.modelInfo,'$.name') real,
             m.tokens, m.tpsAvg tps, m.latencyFirstTokenMs ttft, m.durationMs dur, m.generatedContent content
      FROM metrics m JOIN rounds r ON m.roundId=r.id JOIN participants p ON m.participantId=p.id
      WHERE r.sessionId LIKE ?||'%' AND r."index"=? ORDER BY m.tokens""",
      (sess_prefix, idx)).fetchall()

m_r1, m_r2 = metrics_for(S_DESAFIO, 1), metrics_for(S_DESAFIO, 2)
v_r1, v_r2 = votes_for(S_DESAFIO, 1), votes_for(S_DESAFIO, 2)
round_params = {r['index']: r for r in db.execute('SELECT "index", temperature, seed, maxTokens FROM rounds')}

# Elenco: um participante é um id; quem entrou nas duas sessões tem uma linha
# só (o id é a chave e a linha guarda a sessão mais recente). O modelo vem do
# último registro de cada id no event log.
reg = db.execute("""SELECT actorId id, json_extract(metadata,'$.nickname') nick, json_extract(metadata,'$.model') model,
                           sessionId, timestamp FROM event_logs WHERE eventType='participant_registered' ORDER BY timestamp""").fetchall()
_last = {}
for r in reg: _last[r['id']] = r
_by_nick = {}
for r in _last.values(): _by_nick.setdefault(r['nick'].strip().lower(), r)
roster = sorted(_by_nick.values(), key=lambda r: r['nick'].strip().lower())
nicks = len(roster)
in_desafio = len({r['id'] for r in reg if r['sessionId'].startswith(S_DESAFIO)})
in_world = len({r['id'] for r in reg if r['sessionId'].startswith(S_WORLD)})
in_both = len({r['id'] for r in reg if r['sessionId'].startswith(S_DESAFIO)} & {r['id'] for r in reg if r['sessionId'].startswith(S_WORLD)})
model_names = sorted({r['model'].strip() for r in reg})
models = len(model_names)
voters, total_votes, zeros = db.execute("SELECT count(DISTINCT voterHash), count(*), sum(score=0) FROM votes").fetchone()
score_dist = dict(db.execute("SELECT score, count(*) FROM votes GROUP BY score").fetchall())

# Famílias de modelos e origem do laboratório. A oficina comparou o que sai
# dos EUA, da China e da Europa; a sala respondeu com o que baixou.
def familia(m):
    m = m.lower()
    if 'qwen' in m: return ('Qwen', 'Alibaba', 'China')
    if 'minicpm' in m: return ('MiniCPM', 'OpenBMB', 'China')
    if 'gemma' in m: return ('Gemma', 'Google', 'EUA')
    if 'smollm' in m: return ('SmolLM', 'Hugging Face', 'EUA/França')
    return (m, '?', '?')
fam_people = collections.defaultdict(set)
for r in reg: fam_people[familia(r['model'])].add(r['id'])
fam_rows = sorted(({'nick': f'{f} ({pais})', 'lab': lab, 'total': len(ids)} for (f, lab, pais), ids in fam_people.items()),
                  key=lambda r: -r['total'])
qwen_share = len(fam_people[('Qwen', 'Alibaba', 'China')])
people_total = len({r['id'] for r in reg})

# ---------------- World ----------------
# Não houve 'world_stopped': o placar sai dos snapshots (score só cresce).
# Modo manual (teclado, say='manual') sai da conta, como no 7º encontro.
best_score, peak_state, peak_ts, snapshots_count = {}, None, 0, 0
falas_n, manual_frames, gain_manual = collections.Counter(), collections.Counter(), collections.Counter()
say_count = collections.Counter()
_prev = {}
HEAD = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']  # y cresce para baixo: 0 rad = E, -pi/2 = N
def compass(h): return HEAD[round(math.degrees(h) / 45) % 8]
# O teste do exemplo copiado: quando o agente repete o comentário do exemplo
# antigo do protocolo, para onde ele está indo?
EXEMPLO = 'indo atrás da comida'
def copia_vs_resto(conn):
    cop, out, who, alls = collections.Counter(), collections.Counter(), set(), set()
    for (m,) in conn.execute("SELECT metadata FROM event_logs WHERE eventType='world_snapshot'"):
        for a in json.loads(m)['agents']:
            if a.get('isBot') or a.get('heading') is None: continue
            say = (a.get('say') or '').strip().lower()
            # fora: sem fala, modo manual e o 'nhom!' que o servidor põe ao comer
            if not say or say == 'manual' or 'nhom' in say: continue
            alls.add(a['nickname'])
            if say.startswith(EXEMPLO): cop[compass(a['heading'])] += 1; who.add(a['nickname'])
            else: out[compass(a['heading'])] += 1
    nc, no = sum(cop.values()) or 1, sum(out.values()) or 1
    return {'ne_cop': 100*cop['NE']/nc, 'ne_out': 100*out['NE']/no, 'frames': sum(cop.values()), 'who': len(who), 'all': len(alls)}
copia = copia_vs_resto(db)
copia7 = copia_vs_resto(db7)

heading_all = collections.Counter()
for row in db.execute("SELECT timestamp, metadata FROM event_logs WHERE eventType='world_snapshot' ORDER BY timestamp"):
    snapshots_count += 1
    st = json.loads(row['metadata'])
    ags = st.get('agents', [])
    if peak_state is None or len(ags) > len(peak_state.get('agents', [])):
        peak_state, peak_ts = st, row['timestamp']
    for a in ags:
        if a.get('isBot'): continue
        n = a.get('nickname')
        if a.get('heading') is not None: heading_all[compass(a['heading'])] += 1
        sc = a.get('score') or 0
        say = (a.get('say') or '').strip()
        is_manual = say.lower() == 'manual'
        if say: falas_n[n] += 1; say_count[say.lower()] += 1
        if is_manual: manual_frames[n] += 1
        if n in _prev:
            delta = sc - _prev[n][0]
            if delta > 0 and (_prev[n][1] or is_manual): gain_manual[n] += delta
        _prev[n] = (sc, is_manual)
        best_score[n] = max(best_score.get(n, 0), sc)
world_scores = [{'nickname': n, 'score': s, 'manual': manual_frames.get(n, 0),
                 'manual_pct': (100*manual_frames.get(n, 0)/falas_n[n]) if falas_n.get(n) else 0,
                 'gain_manual': gain_manual.get(n, 0), 'llm_score': s - gain_manual.get(n, 0)}
                for n, s in sorted(best_score.items(), key=lambda x: -x[1])]
manual_players = [w for w in world_scores if w['manual'] > 0]
champ_llm = max(world_scores, key=lambda w: w['llm_score'])
bruto_lider = world_scores[0]
peak_time = datetime.datetime.fromtimestamp(peak_ts/1000).strftime('%H:%M:%S')
ht = sum(heading_all.values())
ne_geral = 100*heading_all['NE']/ht
exemplo_falas = sum(v for k, v in say_count.items() if k.startswith(EXEMPLO))
fala_top, fala_top_n = max(((k, v) for k, v in say_count.items() if k != 'manual'), key=lambda kv: kv[1])

prompt_rows = db.execute("""SELECT json_extract(metadata,'$.nickname') nick, json_extract(metadata,'$.template') t
  FROM event_logs WHERE eventType='agent_prompt_changed' AND json_extract(metadata,'$.isDefault')=0 ORDER BY timestamp""").fetchall()
prompt_last = {}
for r in prompt_rows: prompt_last[r['nick']] = r['t']
def estrategia_de(nick):
    m = re.search(r'SUA ESTRATÉGIA:\s*(.*)', prompt_last.get(nick, ''))
    return m.group(1).strip() if m else ''
def objetivo_de(nick):
    m = re.search(r'OBJETIVO DO JOGO:\s*(.*)', prompt_last.get(nick, ''))
    return m.group(1).strip() if m else ''

# ---------------- votos: aparelhos ----------------
def _os_of(ua):
    ua = ua or ''
    if 'iPhone' in ua: return 'iPhone'
    if 'iPad' in ua: return 'iPad'
    if 'Android' in ua: return 'Android'
    if 'Windows' in ua: return 'Windows'
    if 'Mac OS X' in ua or 'Macintosh' in ua: return 'Mac'
    if 'Linux' in ua: return 'Linux'
    return 'outro'
devices = collections.Counter(_os_of(r[0]) for r in db.execute("SELECT userAgent FROM votes"))
device_rows = [{'nick': k, 'total': v} for k, v in devices.most_common()]

# ---------------- log ----------------
req = collections.Counter(); c429 = 0; ips = set(); boots = 0; rescued = 0
for line in open(LOG):
    try: d = json.loads(line)
    except Exception: continue
    t = datetime.datetime.fromtimestamp(d['time']/1000)
    if t < DAY_START: continue
    m = d.get('msg', '')
    if m == 'incoming request': req[t.strftime('%H:%M')] += 1; ips.add(d.get('req', {}).get('remoteAddress'))
    elif m.startswith('HTTP_429'): c429 += 1
    elif 'Flushed buffered tokens' in m: rescued += 1
    elif 'listening' in m.lower(): boots += 1
total_req = sum(req.values()); peak_min, peak_val = req.most_common(1)[0]
# IPs que bateram no servidor antes de a sessão de desafio abrir (11:02)
ips_antes = set()
for line in open(LOG):
    try: d = json.loads(line)
    except Exception: continue
    t = datetime.datetime.fromtimestamp(d['time']/1000)
    if DAY_START <= t < datetime.datetime(2026, 9, 30, 11, 2) and d.get('msg') == 'incoming request':
        ips_antes.add(d.get('req', {}).get('remoteAddress'))

# ---------------- capivara: oficina x 7º encontro ----------------
r1_7 = db7.execute("""SELECT id FROM rounds WHERE sessionId LIKE '386428e9%' AND "index"=1""").fetchone()['id']
cap7 = db7.execute("SELECT (SELECT count(*) FROM metrics WHERE roundId=?) g, count(*) v, avg(score) a, sum(score=0) z FROM votes WHERE roundId=?", (r1_7, r1_7)).fetchone()
cap7_win = db7.execute("""SELECT p.nickname nick, p.model model, avg(v.score) a FROM votes v JOIN participants p ON p.id=v.participantId
  WHERE v.roundId=? GROUP BY p.id ORDER BY a DESC LIMIT 1""", (r1_7,)).fetchone()
cap7_svgs = sum(1 for (c,) in db7.execute("SELECT generatedContent FROM metrics WHERE roundId=?", (r1_7,)) if c and '<svg' in c)
def mediana(xs): xs = sorted(xs); return xs[len(xs)//2] if xs else 0
cap7_tps = mediana([x for (x,) in db7.execute("SELECT tpsAvg FROM metrics WHERE roundId=?", (r1_7,))])
r2_id = db.execute("""SELECT id FROM rounds WHERE sessionId LIKE ?||'%' AND "index"=2""", (S_DESAFIO,)).fetchone()['id']
cap_of = db.execute("SELECT count(*) v, avg(score) a, sum(score=0) z FROM votes WHERE roundId=?", (r2_id,)).fetchone()
cap_of_svgs = sum(1 for r in m_r2 if r['content'] and '<svg' in r['content'])
cap_of_tps = mediana([r['tps'] for r in m_r2])

# ---------------- helpers (linguagem visual do relatório do 5º encontro) ----------------
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
        if v: parts.append(f'<circle cx="{X(mm):.1f}" cy="{Y(v):.1f}" r="9" class="hit" data-tip="{hm}: {v} requisições/min"/>')
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

# ---------------- montagem ----------------
medal = ['🥇','🥈','🥉']
def rank(i): return medal[i] if i < 3 else f'{i+1}º'

def tip(r, short=False):
    # mesmo critério do telão: média das notas
    return f"{r['avg']:.2f}" if short else f"{r['nick']} ({r['model']}): média {r['avg']:.2f} · {r['n']} votos · {r['total']} pts"

world_rows = sorted(
    [{'nick': s['nickname'] + (' 🎮' if s['manual'] else ''), 'total': s['llm_score'],
      'bruto': s['score'], 'man': s['gain_manual'], 'pct': s['manual_pct']}
     for s in world_scores],
    key=lambda r: -r['total'])

def wtip(r, short=False):
    if short: return f"{r['total']} 🍏"
    if r['man']:
        return (f"{r['nick']}: {r['total']} comidas com o modelo decidindo · "
                f"{r['bruto']} no total, ~{r['man']} no modo manual ({r['pct']:.0f}% das falas amostradas)")
    return f"{r['nick']}: {r['total']} comidas, todas decididas pelo modelo"

def dtip(r, short=False):
    return f"{r['total']}" if short else f"{r['nick']}: {r['total']} votos"

def ftip(r, short=False):
    return f"{r['total']}" if short else f"{r['nick']}, laboratório {r['lab']}: {r['total']} de {people_total} participantes"

def ptip(r, short=False):
    return f"{r['total']:.0f}%" if short else f"{r['nick']}: {r['total']:.0f}% dos quadros com rumo NE ({r['base']})"

ne_rows = [
    {'nick': 'Oficina, copiando', 'total': copia['ne_cop'], 'base': f"{copia['frames']} quadros de {copia['who']} agentes"},
    {'nick': 'Oficina, sem copiar', 'total': copia['ne_out'], 'base': 'falas próprias do modelo'},
    {'nick': '7º encontro, copiando', 'total': copia7['ne_cop'], 'base': f"{copia7['frames']} quadros de {copia7['who']} agentes"},
    {'nick': '7º encontro, sem copiar', 'total': copia7['ne_out'], 'base': 'falas próprias do modelo'},
]

charts = {
 'activity': timeseries_chart(req, '10:40', '12:55', [
    ('primeiras conexões', '10:44', 14),
    ('rodada 1', '11:09', 44),
    ('capivara', '11:15', 74),
    ('votação', '11:30', 14),
    ('World', '11:44', 104),
 ]),
 'world': hbar_chart([r for r in world_rows if r['total'] > 0], 'total', wtip,
                     color='var(--series-2)', winner_color='var(--series-2)'),
 'r2': hbar_chart(v_r2, 'avg', tip, max_override=5, divs=5),
 'ne': hbar_chart(ne_rows, 'total', ptip, max_override=100),
 'familias': hbar_chart(fam_rows, 'total', ftip, color='var(--series-2)', winner_color='var(--series-2)'),
 'devices': hbar_chart(device_rows, 'total', dtip, color='var(--series-2)', winner_color='var(--series-2)'),
}

tiles = [
 (nicks, 'participantes'), (models, 'modelos diferentes'), (len(ips), 'dispositivos na rede'),
 (total_votes, f'votos de {voters} votantes'),
 (len(peak_state['agents']), f'agentes no pico do World ({peak_time})'),
 (champ_llm['llm_score'], f'comidas do campeão do World ({esc(champ_llm["nickname"])})'),
 (f"{copia['ne_cop']:.0f}%", 'rumo NE de quem repetiu o exemplo'),
 (c429, 'rate limits'),
]
tiles_html = ''.join(f'<div class="tile"><div class="tile-v">{v}</div><div class="tile-l">{l}</div></div>' for v,l in tiles)

r2_win = v_r2[0]
timeline = [
 ('09:00', 'Servidor no ar 🔌', 'A oficina começa pela teoria: o que é um modelo de linguagem, parâmetros, quantização, o que cabe em cada máquina. A Arena fica de pé esperando a hora de a sala entrar.'),
 ('10:41-10:59', 'Primeiros notebooks na rede', f'Com o Ollama instalado, as primeiras máquinas abrem a página do participante: {len(ips_antes)} endereços diferentes bateram no servidor antes de a sessão abrir.'),
 ('11:02', 'Sessão de desafio 🔑', f'PIN na tela e a sala entra. {in_desafio} participantes passaram por esta sessão.'),
 ('11:09-11:15', 'Rodada 1: a capital de Pernambuco 🗺️', f'Pergunta de aquecimento, de resposta curta. {len(m_r1)} respostas, nenhuma votação: a rodada serviu para todo mundo ver o próprio modelo aparecer no telão.'),
 ('11:15-11:30', 'Rodada 2: a capivara dançando frevo 🐹', f'O clássico do clube, o mesmo prompt do 7º encontro. {len(m_r2)} gerações em 15 minutos de telão.'),
 ('11:30-11:33', 'Votação relâmpago 🗳️', f'{total_votes} votos de {voters} celulares e notebooks em três minutos, com pico de {peak_val} requisições por minuto às {peak_min}. Nenhum erro de limite de taxa.'),
 ('11:33', 'Premiação 🏆', f'Revelação posição a posição. <b>{esc(r2_win["nick"])}</b> vence com média {r2_win["avg"]:.2f}.'),
 ('11:41-12:33', 'World 🌍', f'Nova sessão, agora só com agentes. {in_world} participantes entram no mundo, com pico de {len(peak_state["agents"])} agentes simultâneos às {peak_time}. Último snapshot às 12:33.'),
]
timeline_html = ''.join(
 f'<div class="tl-item"><div class="tl-time">{esc(t)}</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">{esc(ti)}</div><div class="tl-desc">{d}</div></div></div>'
 for t, ti, d in timeline)

# elenco
roster_html = ''.join(
    f'<div class="who-card"><div class="who-nick">{esc(r["nick"].strip())}</div>'
    f'<div class="who-model"><code>{esc(r["model"].strip())}</code></div></div>'
    for r in roster)

# ---------------- rodada 1: as respostas, agrupadas por texto idêntico ----------------
def acertou(c):
    # vale a primeira frase ou a conclusão (modelos que pensam em voz alta só
    # respondem no último parágrafo)
    pars = [p for p in (c or '').split('\n') if p.strip()]
    return bool(pars) and ('Recife' in pars[0] or 'Recife' in pars[-1])
grupos_r1 = collections.OrderedDict()
for r in m_r1:
    grupos_r1.setdefault(hashlib.md5((r['content'] or '').encode()).hexdigest(), []).append(r)
acertos_r1 = sum(1 for r in m_r1 if acertou(r['content']))
def resumo(c, n=330):
    c = re.sub(r'\*\*', '', (c or '').strip())
    return c if len(c) <= n else c[:n].rsplit(' ', 1)[0] + '…'
answers_html = ''
for g in sorted(grupos_r1.values(), key=lambda g: (acertou(g[0]['content']), -len(g), g[0]['tokens'])):
    r0 = g[0]
    ok = acertou(r0['content'])
    quem = ', '.join(esc(r['nick']) for r in g)
    mods = sorted({(r['real'] or r['model']).strip() for r in g})
    selo = '✅ Recife' if ok else '❌ errou'
    gem = f' · <b>{len(g)} notebooks, texto idêntico</b>' if len(g) > 1 else ''
    answers_html += (f'<div class="ans {"ok" if ok else "err"}"><div class="ans-h"><span class="ans-s">{selo}</span> {quem}{gem}</div>'
                     f'<blockquote>{esc(resumo(r0["content"]))}</blockquote>'
                     f'<div class="ans-m">{esc(", ".join(mods))} · {r0["tokens"]} tokens</div></div>')

# ---------------- rodada 2: galeria ----------------
gallery, sem_svg = [], []
by_nick = {r['nick']: r for r in m_r2}
for i, v in enumerate(v_r2):
    mrow = by_nick.get(v['nick'])
    if not mrow: continue
    img, rep = svg_img(mrow['content'], f'SVG de {v["nick"]}')
    if not img:
        sem_svg.append((v, mrow)); continue
    nota = ' · truncado, restaurado' if rep else ''
    gallery.append(f'<figure class="cap"><div class="cap-img">{img}</div><figcaption><span class="cap-rank">{rank(i)}</span> <strong>{esc(v["nick"])}</strong><br><span class="cap-meta">{esc((mrow["real"] or mrow["model"]).strip())} · média {v["avg"]:.2f} · {v["n"]} votos{nota}</span></figcaption></figure>')
gallery_html = ''.join(gallery)
sem_svg_nomes = ', '.join(esc(v['nick']) for v, _ in sem_svg)

# ---------------- gêmeos ----------------
twins = []
for label, idx, mets in [('Rodada 1', 1, m_r1), ('Rodada 2', 2, m_r2)]:
    by_hash = collections.defaultdict(list)
    for r in mets:
        if r['content']: by_hash[hashlib.md5(r['content'].encode()).hexdigest()].append(r)
    for grupo in by_hash.values():
        if len(grupo) > 1: twins.append({'rodada': label, 'idx': idx, 'membros': grupo})
twins_html = ''
for t in sorted(twins, key=lambda t: -len(t['membros'])):
    linhas = ''.join(
        f'<tr><td>{esc(r["nick"])}</td><td><code>{esc((r["real"] or r["model"]).strip())}</code></td>'
        f'<td class="num">{r["tokens"]}</td><td class="num">{(r["tps"] or 0):.1f}</td>'
        f'<td class="num">{(r["dur"] or 0)/1000:.1f} s</td></tr>'
        for r in t['membros'])
    # mesmos pesos explicam o determinismo; modelos diferentes só coincidem
    # quando a resposta é curta demais para divergir, e isso é dito no texto
    mods = {(r['real'] or r['model']).strip() for r in t['membros']}
    obs = ('' if len(mods) == 1 else
           f' Aqui são <strong>modelos diferentes</strong>: numa resposta de {t["membros"][0]["tokens"]} tokens, '
           'a frase mais provável é a mesma para os dois, e coincidir é fácil. O determinismo de verdade aparece nos grupos longos.')
    twins_html += (f'<p class="lede"><strong>{t["rodada"]}, {len(t["membros"])} notebooks:</strong> os mesmos '
                   f'{t["membros"][0]["tokens"]} tokens, na mesma ordem.{obs}</p>'
                   f'<div class="card" style="margin-bottom:18px"><table class="cmp">'
                   f'<tr><th>Participante</th><th>Modelo que gerou</th><th>tokens</th><th>tokens/s</th><th>duração</th></tr>'
                   f'{linhas}</table></div>')
maior_gemeo = max(twins, key=lambda t: len(t['membros']))
gemeos_total = sum(len(t['membros']) for t in twins)
gemeos_pessoas = len({r['nick'] for t in twins for r in t['membros']})

# ---------------- comparativo da capivara ----------------
comparativo = [
 ('Gerações', f"{cap7['g']}", f"{len(m_r2)}"),
 ('Desenhos com SVG', f"{cap7_svgs}", f"{cap_of_svgs}"),
 ('Votos', f"{cap7['v']}", f"{cap_of['v']}"),
 ('Média geral das notas', f"{cap7['a']:.2f}", f"{cap_of['a']:.2f}"),
 ('Notas zero', f"{cap7['z']} ({100*cap7['z']/cap7['v']:.0f}%)", f"{cap_of['z']} ({100*cap_of['z']/cap_of['v']:.0f}%)"),
 ('Vencedor', f"{esc(cap7_win['nick'])} · {cap7_win['a']:.2f}", f"{esc(r2_win['nick'])} · {r2_win['avg']:.2f}"),
 ('Modelo do vencedor', f"<code>{esc(cap7_win['model'])}</code>", f"<code>{esc(r2_win['model'])}</code>"),
 ('Velocidade mediana', f"{cap7_tps:.0f} tokens/s", f"{cap_of_tps:.0f} tokens/s"),
]
comp_html = ''.join(f'<tr><td>{a}</td><td class="num">{b}</td><td class="num">{c}</td></tr>' for a,b,c in comparativo)

# ---------------- curiosidades ----------------
ber = next(r for r in m_r1 if r['nick'] == 'Ber0z')
ber_janela = (ber['dur'] - ber['ttft'])
def br(x, casas=1): return f'{x:.{casas}f}'.replace('.', ',')  # decimal com vírgula na prosa
hyogo = next(r for r in m_r1 if r['nick'] == 'Hyogo')
segunda_maior = sorted(r['tokens'] for r in m_r1)[-2]
fox_obj = objetivo_de('Fox')
dpz_obj = objetivo_de('DPZ')
diogo = estrategia_de('Diogo Fragoso')
qwen05_ids = {i for i, r in _last.items() if r['model'].strip() == 'qwen2.5:0.5b'}
q05_r2 = [r for r in m_r2 if (r['real'] or r['model']).strip() == 'qwen2.5:0.5b']
q05_ok = sum(1 for r in q05_r2 if r['content'] and '</svg>' in r['content'])
q05_sem = sum(1 for r in q05_r2 if not (r['content'] and '<svg' in r['content']))
champ_model = next((r['model'].strip() for r in _last.values() if r['nick'].strip() == champ_llm['nickname'].strip()), '?')
# agente com maior fração de rumo NE (mínimo de 20 quadros)
_ne = collections.defaultdict(collections.Counter)
for (m,) in db.execute("SELECT metadata FROM event_logs WHERE eventType='world_snapshot'"):
    for a in json.loads(m)['agents']:
        if not a.get('isBot') and a.get('heading') is not None: _ne[a['nickname']][compass(a['heading'])] += 1
ne_top_nick, ne_top_pct = max(((n, 100*c['NE']/sum(c.values())) for n, c in _ne.items() if sum(c.values()) >= 20), key=lambda x: x[1])
dpz_frase = (f'Foi também o agente que mais apontou para o nordeste, {ne_top_pct:.0f}% do tempo: a tranquilidade tinha direção.'
             if ne_top_nick == 'DPZ' else '')
curios = [
 ('Dobradinha', f'<b>{esc(champ_llm["nickname"])}</b> venceu a capivara e também o World, com {champ_llm["llm_score"]} comidas sem tocar no teclado, as duas vezes com um Qwen 4B customizado de nome sugestivo: <code>{esc(champ_model)}</code>.'),
 ('A capital é Pernambuco', 'Dois <code>qwen3.5:0.8b</code> responderam que a capital de Pernambuco é... Pernambuco. Um deles ainda explicou que o nome oficial é "São Luís" e que a cidade também é conhecida como "Capitão Pedro II". Um modelo maior acertou Recife, mas a colocou no litoral sul da Bahia.'),
 ('Pensando em inglês', f'O <code>qwen3:4b</code> do {esc(hyogo["nick"])} gastou {hyogo["tokens"]} tokens raciocinando em inglês ("Okay, so I need to figure out...") antes de responder uma pergunta de uma palavra. Foi a resposta mais longa da rodada, {br(hyogo["tokens"]/segunda_maior)} vezes o tamanho da segunda.'),
 ('O recorde que não foi', f'O painel registrou {ber["tps"]:.0f} tokens por segundo para {esc(ber["nick"])} na rodada 1. Não é verdade: o primeiro token levou {br(ber["ttft"]/1000)} s e os {ber["tokens"]} tokens chegaram juntos em {ber_janela} ms, então a conta divide por quase nada. É uma medida da rede, não do modelo.'),
 ('Placeholders inventados', f'O Fox entendeu que as chaves duplas eram o jeito de falar com o agente e escreveu os próprios: <code>{esc(fox_obj)}</code>. Como o template não reconhece esses nomes, eles chegaram ao modelo literalmente, com chaves e tudo.'),
 ('Andar tranquilo', f'O DPZ trocou o objetivo do jogo por <code>{esc(dpz_obj)}</code>, rodando o <code>gemma3:270m</code>, de 270 milhões de parâmetros. {dpz_frase}'),
 ('Quem viu primeiro', f'Antes de qualquer análise, um participante já tinha percebido os agentes presos e escrito na própria estratégia: <code>{esc(diogo[:150])}…</code>'),
 ('Um 0.5b para cada três', f'Foram {len(qwen05_ids)} participantes com o <code>qwen2.5:0.5b</code>, o modelo mais popular da sala e a escolha de quem queria o menor download possível. Ele responde rápido e em português, mas na capivara só {q05_ok} dos seus {len(q05_r2)} desenhos saiu completo; {q05_sem} notebooks com ele não desenharam nada e entregaram, palavra por palavra, o mesmo tutorial de como fazer um SVG.'),
]
curios_html = ''.join(f'<div class="curio"><div class="curio-t">{t}</div><div class="curio-d">{d}</div></div>' for t,d in curios)

world_svg = world_frame_svg(peak_state)
PH_PROTO = '{{protocolo}}'

page = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gambiarra Arena · Oficina Rec'n'Play (30/09/2026)</title>
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
.falas {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; margin-top:16px; }}
.fala {{ background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }}
.fala-t {{ font-weight:700; margin-bottom:8px; font-size:15px; }}
.fala blockquote {{ margin:0; padding-left:14px; border-left:3px solid var(--series-1); color:var(--ink-2); font-size:14.5px; font-style:italic; }}
.roster {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; margin-top:16px; }}
.who-card {{ background:var(--surface-1); border:1px solid var(--border); border-radius:10px; padding:12px 14px; }}
.who-nick {{ font-weight:700; font-size:15px; }}
.who-model {{ margin-top:4px; }}
.who-model code {{ font-size:11.5px; }}
.who-runner {{ color:var(--muted); font-size:12px; margin-top:3px; }}
.curios {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-top:16px; }}
.curio {{ background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:16px; }}
.curio-t {{ font-weight:700; margin-bottom:4px; }}
.curio-d {{ color:var(--ink-2); font-size:14.5px; }}
code {{ background:var(--grid); border-radius:4px; padding:1px 5px; font-size:.9em; }}
footer {{ margin-top:64px; color:var(--muted); font-size:13.5px; border-top:1px solid var(--grid); padding-top:16px; }}
#tip {{ position:fixed; pointer-events:none; background:var(--ink); color:var(--page); padding:6px 10px; border-radius:7px; font-size:13px; max-width:340px; opacity:0; transition:opacity .1s; z-index:10; }}
#themeBtn {{ position:fixed; top:14px; right:14px; background:var(--surface-1); color:var(--ink); border:1px solid var(--border); border-radius:20px; padding:6px 14px; font-size:13px; cursor:pointer; }}
@media print {{ #themeBtn {{ display:none; }} }}
.answers {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; margin-top:16px; }}
.cap-bad {{ color:#6b6a65; font-size:13px; text-align:center; padding:0 18px; }}
.ans {{ background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:14px 16px; border-left:4px solid var(--series-2); }}
.ans.err {{ border-left-color:#d4513a; }}
.ans-h {{ font-size:14px; font-weight:650; margin-bottom:8px; }}
.ans-s {{ font-size:12.5px; color:var(--muted); margin-right:4px; }}
.ans blockquote {{ margin:0; color:var(--ink-2); font-size:14px; }}
.ans-m {{ color:var(--muted); font-size:12px; margin-top:8px; }}
.proto {{ font-family:ui-monospace,monospace; font-size:13.5px; background:var(--grid); border-radius:8px; padding:12px 14px; white-space:pre-wrap; margin:12px 0; }}
.proto mark {{ background:#ffd34d; color:#0b0b0b; border-radius:3px; padding:0 3px; }}
</style>
</head>
<body>
<button id="themeBtn" onclick="tgl()">◐ tema</button>
<div id="tip"></div>
<div class="wrap">

<header class="hero">
  <div class="kicker">Gambiarra LLM Club · Oficina no Rec'n'Play · 30 de setembro de 2026</div>
  <h1>A sala que copiou o exemplo</h1>
  <p class="sub">Relatório da oficina "IA sem nuvem: rodando modelos de linguagem no seu próprio computador", reconstruído dos registros do servidor. Não foi um encontro do clube: foram três horas para quem nunca tinha rodado um modelo local, terminando com <strong>{nicks} participantes</strong> e <strong>{models} modelos</strong> conectados na Arena, uma capivara dançando frevo, <strong>{total_votes} votos</strong> e um World que revelou um vício escondido no protocolo dos agentes: quando o modelo repetia o exemplo das instruções, ia para o nordeste em <strong>{copia['ne_cop']:.0f}%</strong> das vezes.</p>
  <div class="tiles">{tiles_html}</div>
</header>

<h2>A manhã, minuto a minuto</h2>
<p class="lede">Tráfego HTTP no servidor central, das primeiras conexões até o fim do World. A primeira parte da oficina, de teoria e instalação, quase não aparece aqui: a Arena só acorda quando os notebooks entram na rede, perto das 10h40. Pico de {peak_val} requisições por minuto às {peak_min}, no meio da votação, e {c429} erros de limite de taxa.</p>
<div class="card">{charts['activity']}</div>

<h2>Linha do tempo</h2>
<div style="margin-top:20px">{timeline_html}</div>

<h2>👥 Todo mundo que esteve aqui</h2>
<p class="lede">O elenco completo, em ordem alfabética, com o último modelo que cada um cadastrou. {in_desafio} pessoas passaram pela sessão de desafio, {in_world} pelo World e {in_both} pelas duas.</p>
<div class="roster">{roster_html}</div>

<h2>🌏 De onde vieram os modelos</h2>
<p class="lede">A oficina comparou o que sai dos laboratórios dos Estados Unidos, da China e da Europa. A sala respondeu com o que baixou: <strong>{qwen_share} de {people_total}</strong> participantes usaram um Qwen, da Alibaba, em algum momento da manhã. Ninguém trouxe um modelo europeu.</p>
<div class="card">{charts['familias']}</div>

<h2>🗺️ Rodada 1: qual a capital de Pernambuco?</h2>
<p class="lede">Uma pergunta de aquecimento, de resposta curta, para cada um ver o próprio modelo aparecer no telão. Não houve votação: a urna abriu e fechou em dois segundos, e a sala foi direto para a capivara. {acertos_r1} de {len(m_r1)} respostas acertaram Recife. As outras estão aqui também, que é onde mora a graça. Respostas idênticas aparecem juntas.</p>
<div class="answers">{answers_html}</div>

<h2>🐹 Rodada 2: a capivara dançando frevo</h2>
<p class="lede">O prompt clássico do clube: <em>"Crie o SVG de uma capivara dançando frevo"</em>. {len(m_r2)} gerações e {cap_of['v']} votos. O critério é a média das notas de 0 a 5, o mesmo que o telão revelou posição a posição.</p>
<div class="card">{charts['r2']}</div>

<h2>🖼️ A galeria</h2>
<p class="lede">Todos os desenhos da capivara, exatamente como saíram dos modelos. {len(sem_svg)} participantes não aparecem porque o modelo não desenhou nada: {sem_svg_nomes}.</p>
<div class="gallery">{gallery_html}</div>

<h2>⚖️ A mesma capivara, no clube e na oficina</h2>
<p class="lede">O 7º encontro do clube (22/08) usou exatamente o mesmo prompt, com a mesma temperatura. É a primeira vez que dá para comparar o mesmo desafio entre quem já frequenta o clube e uma sala de quem instalou o Ollama naquela manhã.</p>
<div class="card">
<table class="cmp"><tr><th>Métrica</th><th>7º encontro (22/08)</th><th>Oficina (30/09)</th></tr>{comp_html}</table>
</div>
<p class="lede" style="margin-top:14px">A plateia da oficina foi mais dura: {100*cap_of['z']/cap_of['v']:.0f}% das notas foram zero, contra {100*cap7['z']/cap7['v']:.0f}% no clube. Parte da explicação está na tabela: com modelos menores, mais gente ficou sem desenho nenhum, e o desenho que não existe leva zero.</p>

<h2>🧬 Os gêmeos</h2>
<p class="lede">{gemeos_pessoas} participantes entregaram, em {gemeos_total} gerações, textos byte a byte idênticos aos de outro notebook da sala. O maior grupo foi de <strong>{len(maior_gemeo['membros'])} máquinas</strong>, na {maior_gemeo['rodada'].lower()}.</p>
{twins_html}
<div class="card">
<p style="font-size:15px;color:var(--ink-2)">Não é cola: é como um modelo de linguagem funciona. A cada passo ele calcula a probabilidade de cada próximo token e sorteia um. A arena manda para todo mundo o <strong>mesmo prompt</strong>, a <strong>mesma temperatura</strong> ({round_params[2]['temperature']}) e a <strong>mesma semente aleatória</strong> ({round_params[2]['seed']} na capivara). Com os mesmos pesos, que é o caso de quem baixou o mesmo modelo, o sorteio sai igual e o texto também. O hardware muda só o relógio: repare na coluna de duração. É por isso que o clube pede diversidade de modelos. Na capivara, {len(maior_gemeo['membros'])} dos {len(m_r2)} textos na urna eram o mesmo.</p>
</div>

<h2>🌍 O World</h2>
<p class="lede">O frame real do pico, às {peak_time}, com {len(peak_state['agents'])} agentes simultâneos. Posições, falas e comida são exatamente as que estavam lá, tiradas dos snapshots que o servidor grava a cada cinco segundos.</p>
<div class="card" style="padding:8px">{world_svg}</div>
<p class="lede" style="margin-top:22px">Placar contando <strong>apenas as comidas coletadas com o modelo decidindo</strong>, reconstruído dos {snapshots_count} snapshots (a partida nunca foi encerrada pelo painel). Campeão: <strong>{esc(champ_llm['nickname'])}</strong>, com {champ_llm['llm_score']} comidas.</p>
<div class="card">{charts['world']}</div>
<div class="card" style="margin-top:14px">
<p style="font-size:14.5px;color:var(--ink-2)"><strong>🎮 Por que este placar desconta o modo manual.</strong> O agente pode ser dirigido pelo teclado, sem o modelo. {len(manual_players)} participantes usaram isso em algum momento e estão marcados com 🎮. No total bruto, o topo seria {esc(bruto_lider['nickname'])} com {bruto_lider['score']} comidas, das quais cerca de {bruto_lider['gain_manual']} vieram no teclado. O total sem desconto aparece ao passar o mouse na barra. A medição é por amostragem de cinco em cinco segundos, então é aproximada.</p>
</div>

<h2>🧭 O exemplo que virou ordem</h2>
<p class="lede">Até esta oficina, o protocolo que a página do agente mandava ao modelo era fixo e terminava assim:</p>
<div class="proto">Responda em UMA linha, começando com "MOVE:" seguido da direção e um comentário curto.
Exemplo: <mark>MOVE: NE | indo atrás da comida</mark></div>
<p class="lede">A fala mais repetida do World foi <em>"{esc(fala_top)}"</em>, {fala_top_n} vezes. Era o comentário do exemplo, copiado palavra por palavra. Se o modelo copiava o comentário, será que copiava também a direção? Os snapshots guardam a fala e o rumo de cada agente no mesmo instante, então dá para medir: entre os quadros em que o agente repetia o exemplo, quantos apontavam para o nordeste?</p>
<div class="card">{charts['ne']}</div>
<p class="lede" style="margin-top:14px">Com uma bússola de oito direções, o esperado seria 12,5% para cada uma. Quando o modelo falava com as próprias palavras, o NE ficou abaixo disso. Quando repetia o exemplo, foi para o nordeste em <strong>{copia['ne_cop']:.0f}%</strong> dos quadros na oficina ({copia['who']} de {copia['all']} agentes caíram nisso) e em {copia7['ne_cop']:.0f}% no 7º encontro. Modelos pequenos não tratam o exemplo como ilustração: tratam como a resposta. No geral, o rumo NE apareceu em {ne_geral:.0f}% dos quadros da oficina, diluído por quem não copiou.</p>
<div class="card">
<p style="font-size:14.5px;color:var(--ink-2)"><strong>O que mudou depois.</strong> A discussão saiu da oficina direto para o código. No dia seguinte, o protocolo passou a ser um campo editável na página do agente, com o texto à vista de todo mundo, e o exemplo padrão deixou de citar qualquer direção: virou <code>MOVE: &lt;direção&gt; | &lt;comentário curto&gt;</code>. Quem quiser pode apagar o {PH_PROTO} do template e escrever o próprio jeito de pedir a direção. O próximo encontro vai dizer se o nordeste perde a graça.</p>
</div>

<h2>📱 De onde vieram os votos</h2>
<p class="lede">O aparelho de quem votou, pelo navegador. {voters} votantes em três minutos de urna aberta.</p>
<div class="card">{charts['devices']}</div>

<h2>Curiosidades</h2>
<div class="curios">{curios_html}</div>

<footer>
  <p><strong>Fontes:</strong> banco <code>dev-2026-09-30-recnplay.db</code> (sessões {S_DESAFIO} e {S_WORLD}; {people_total} participantes por id, {nicks} apelidos, 2 rodadas, {len(m_r1)+len(m_r2)} gerações, {total_votes} votos, {snapshots_count} world_snapshots e {len(prompt_rows)} versões de prompt customizado) e log estruturado <code>server-2026-09-30.log</code> ({total_req} requisições de {len(ips)} endereços, {boots} inicialização do servidor, {rescued} gerações resgatadas). Comparações com o 7º encontro: banco <code>dev-2026-08-22.db</code>. <strong>Recorte:</strong> de 30/09 às 8h em diante; o mesmo arquivo de log tem o ensaio da véspera, que ficou de fora. Os rumos do World vêm do campo <code>heading</code> dos snapshots, que guarda o último movimento mesmo quando o agente está parado: medem tendência, não decisão a decisão. Relatório gerado em {datetime.date.today().strftime('%d/%m/%Y')}. 🐹🤖</p>
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
print('OK:', OUT, f'{len(page)/1024:.0f} KB | galeria: {len(gallery)} | sem svg: {len(sem_svg)} | world agents: {len(peak_state["agents"])} | gêmeos: {[len(t["membros"]) for t in twins]}')
