#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera o relatório HTML do encontro Gambiarra Arena de 23/05/2026
a partir do dev.db e dos logs do servidor (checkout gambiarra-arena-world)."""
import sqlite3, json, re, base64, html, collections, datetime, os, sys

W = '/Users/filipecalegario/git/GAMBIARRA/gambiarra-arena-world/gambiarra-arena/server'
DB = W + '/prisma/dev.db'
LOG = W + '/logs/server-2026-05-23.log'
OUTPATH = '/Users/filipecalegario/git/GAMBIARRA/gambiarra-arena/docs/reports/encontro-2026-05-23.html'

# sobrescreve apenas o relatório gerado por este próprio script

db = sqlite3.connect('file:' + DB + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row

CUT = 1779530000000  # ~2026-05-23 06:00 local
S_R1 = '29f5e40c-41bb-4f78-a987-6b47acf1ab4b'
S_FINAL = '16861da3-d46b-44a8-9bc0-fa4bab8be4f4'
S_SONETO = '1f5260c1-ef9a-4c2c-9256-ee1e0cf5b78a'

# ---------- dados ----------
def votes_for(session, idx):
    return db.execute("""
      SELECT p.nickname nick, p.model model, count(*) n, avg(v.score) avg, sum(v.score) total
      FROM votes v JOIN rounds r ON v.roundId=r.id JOIN participants p ON v.participantId=p.id
      WHERE r.sessionId=? AND r."index"=? GROUP BY p.id ORDER BY total DESC, avg DESC""",
      (session, idx)).fetchall()

def metrics_for(session, idx):
    return db.execute("""
      SELECT p.nickname nick, p.model model, m.tokens, m.latencyFirstTokenMs lat,
             m.durationMs dur, m.tpsAvg tps, m.generatedContent content
      FROM metrics m JOIN rounds r ON m.roundId=r.id JOIN participants p ON m.participantId=p.id
      WHERE r.sessionId=? AND r."index"=? ORDER BY m.tokens DESC""",
      (session, idx)).fetchall()

v_r1 = votes_for(S_R1, 1)
v_final = votes_for(S_FINAL, 2)
m_r1 = metrics_for(S_R1, 1)
m_aq = metrics_for(S_FINAL, 1)
m_final = metrics_for(S_FINAL, 2)
m_soneto = metrics_for(S_SONETO, 1)

total_votes = db.execute("SELECT count(*) FROM votes WHERE createdAt>?", (CUT,)).fetchone()[0]
voters = db.execute("SELECT count(DISTINCT voterHash) FROM votes WHERE createdAt>?", (CUT,)).fetchone()[0]
nicks = db.execute("""SELECT count(DISTINCT nickname) FROM participants WHERE sessionId IN (?,?,?)""",
                   (S_R1, S_FINAL, S_SONETO)).fetchone()[0]
models = db.execute("""SELECT count(DISTINCT model) FROM participants WHERE sessionId IN (?,?,?)""",
                    (S_R1, S_FINAL, S_SONETO)).fetchone()[0]

# bestiário do World (emojis)
emo = collections.Counter()
world_first = {}
for r in db.execute("SELECT actorId, metadata FROM event_logs WHERE eventType='world_joined' AND timestamp>?", (CUT,)):
    try: md = json.loads(r['metadata'])
    except Exception: continue
    if r['actorId'] not in world_first:
        world_first[r['actorId']] = md
        emo[md.get('emoji','?')] += 1

# ---------- log ----------
req = collections.Counter(); ws = collections.Counter(); h429 = collections.Counter()
completes = 0; seq_mm = 0; dedup = 0; disc = 0; regs = 0; ips = set(); starts = []
world_join_10m = collections.Counter()
for line in open(LOG):
    try: d = json.loads(line)
    except Exception: continue
    t = datetime.datetime.fromtimestamp(d['time']/1000); hm = t.strftime('%H:%M'); m = d.get('msg','')
    if m == 'incoming request':
        req[hm] += 1; ips.add(d.get('req',{}).get('remoteAddress'))
    elif m.startswith('WS_REGISTERED'): ws[hm] += 1; regs += 1
    elif m.startswith('HTTP_429'): h429[hm] += 1
    elif m.startswith('WS_COMPLETE'): completes += 1
    elif m.startswith('WS_SEQ_MISMATCH'): seq_mm += 1
    elif m.startswith('WS_DEDUP'): dedup += 1
    elif m.startswith('WS_DISCONNECTED'): disc += 1
    elif m.startswith('WORLD_JOIN'): world_join_10m[hm[:4]+'0'] += 1
    elif m == 'Server listening at http://0.0.0.0:3000': starts.append(t.strftime('%H:%M'))
total_req = sum(req.values()); total_429 = sum(h429.values())
peak_min, peak_val = req.most_common(1)[0]

# ---------- helpers ----------
def esc(s): return html.escape(str(s), quote=True)

def extract_svg(content):
    """Retorna (svg, reparado). Repara SVGs truncados no limite de tokens
    cortando no último tag completo e fechando os tags abertos."""
    if not content: return None, False
    m = re.search(r'<svg[\s\S]*?</svg>', content)
    if m:
        svg, repaired = m.group(0), False
    else:
        m = re.search(r'<svg[\s\S]*', content)
        if not m or '>' not in m.group(0): return None, False
        frag = m.group(0)
        frag = frag[:frag.rfind('>')+1]
        if frag.count('<!--') > frag.count('-->'):
            frag = frag[:frag.rfind('<!--')]
        stack = []
        for tag in re.finditer(r'<(/?)([A-Za-z][\w:-]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)>', frag):
            close, name, attrs = tag.groups()
            if close:
                if name in stack:
                    while stack and stack[-1] != name: stack.pop()
                    if stack: stack.pop()
            elif not attrs.rstrip().endswith('/'):
                stack.append(name)
        svg = frag + ''.join(f'</{n}>' for n in reversed(stack))
        repaired = True
    if 'xmlns' not in svg.split('>',1)[0]:
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    return svg, repaired

def svg_img(content, alt):
    svg, repaired = extract_svg(content)
    if not svg: return None, False
    b64 = base64.b64encode(svg.encode('utf-8')).decode('ascii')
    return f'<img loading="lazy" src="data:image/svg+xml;base64,{b64}" alt="{esc(alt)}">', repaired

def fmt_dur(ms):
    s = ms/1000
    return f'{s:.1f} s' if s < 60 else f'{int(s//60)} min {int(s%60)} s'

# barras horizontais (SVG inline, tema via CSS vars)
def nice_ticks(v):
    """Escala com 4 divisões redondas cobrindo v."""
    import math
    base = 10 ** math.floor(math.log10(max(v, 4)/4))
    for mult in (1, 2, 2.5, 5, 10):
        step = base*mult
        if step*4 >= v:
            return step*4, step
    return v, v/4

def hbar_chart(rows, value_key, label_fn, tip_fn, max_v=None, bar_h=20, gap=10, color='var(--series-1)', winner_color='var(--series-1-strong)'):
    if not rows: return ''
    max_v, tick_step = nice_ticks(max_v or max(r[value_key] for r in rows))
    lab_w, val_w, w = 230, 130, 900
    plot_w = w - lab_w - val_w
    h = len(rows)*(bar_h+gap) + 24
    parts = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img">']
    # gridlines a cada quarto
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
        nick = label_fn(r)
        nick_show = nick if len(nick) <= 24 else nick[:23] + '…'
        parts.append(f'<text x="{lab_w-10}" y="{y+bar_h/2+4}" class="blab" text-anchor="end">{esc(nick_show)}</text>')
        parts.append(f'<path d="{path}" fill="{c}" class="bar" data-tip="{esc(tip_fn(r))}"/>')
        parts.append(f'<text x="{lab_w+bw+8}" y="{y+bar_h/2+4}" class="bval">{esc(tip_fn(r, short=True))}</text>')
    # eixo x
    for i in range(5):
        x = lab_w + plot_w*i/4
        parts.append(f'<text x="{x:.0f}" y="{h-4}" class="tick" text-anchor="middle">{tick_step*i:g}</text>')
    parts.append('</svg>')
    return ''.join(parts)

# série temporal com anotações
def timeseries_chart(counter, t0='10:30', t1='12:35', annotations=()):
    def mins(hm): h,m = map(int, hm.split(':')); return h*60+m
    a, b = mins(t0), mins(t1)
    pts = []
    for mm in range(a, b+1):
        hm = f'{mm//60:02d}:{mm%60:02d}'
        pts.append((mm, counter.get(hm, 0), hm))
    max_v = max(v for _,v,_ in pts) or 1
    W_, H_, padL, padR, padT, padB = 900, 300, 56, 16, 30, 34
    pw, ph = W_-padL-padR, H_-padT-padB
    def X(mm): return padL + pw*(mm-a)/(b-a)
    def Y(v): return padT + ph*(1 - v/max_v)
    line = ' '.join(f'{X(mm):.1f},{Y(v):.1f}' for mm,v,_ in pts)
    area = f'{X(a):.1f},{Y(0):.1f} ' + line + f' {X(b):.1f},{Y(0):.1f}'
    parts = [f'<svg class="chart" viewBox="0 0 {W_} {H_}" role="img">']
    ymax = (int(max_v/250)+1)*250
    for gv in range(0, ymax+1, 250):
        if gv > max_v*1.08: break
        y = Y(gv)
        parts.append(f'<line x1="{padL}" y1="{y:.1f}" x2="{W_-padR}" y2="{y:.1f}" class="grid"/>')
        parts.append(f'<text x="{padL-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{gv}</text>')
    for mm in range(a, b+1):
        if mm % 15 == 0:
            parts.append(f'<text x="{X(mm):.1f}" y="{H_-8}" class="tick" text-anchor="middle">{mm//60:02d}:{mm%60:02d}</text>')
    parts.append(f'<polygon points="{area}" class="area"/>')
    parts.append(f'<polyline points="{line}" class="line"/>')
    for label, hm, dy in annotations:
        x = X(mins(hm))
        parts.append(f'<line x1="{x:.1f}" y1="{padT-6}" x2="{x:.1f}" y2="{H_-padB}" class="ann"/>')
        anchor = 'end' if mins(hm) > (a+b)/2 else 'start'
        xoff = -6 if anchor == 'end' else 6
        parts.append(f'<text x="{x+xoff:.1f}" y="{padT+dy}" class="annlab" text-anchor="{anchor}">{esc(label)}</text>')
    # pontos de hover (1/min)
    for mm, v, hm in pts:
        if v == 0: continue
        parts.append(f'<circle cx="{X(mm):.1f}" cy="{Y(v):.1f}" r="9" class="hit" data-tip="{hm} — {v} requisições/min"/>')
    parts.append(f'<line x1="{padL}" y1="{Y(0):.1f}" x2="{W_-padR}" y2="{Y(0):.1f}" class="axis"/>')
    parts.append('</svg>')
    return ''.join(parts)

# ---------- montagem ----------
def scoreboard_rows(votes, medals=3):
    out = []
    medal = ['🥇','🥈','🥉']
    for i, r in enumerate(votes):
        out.append(dict(r) | {'rank': (medal[i] if i < medals else f'{i+1}º')})
    return out

sb_final = scoreboard_rows(v_final)
sb_r1 = scoreboard_rows(v_r1)

# galeria: melhores capivaras votadas com SVG válido
gallery = []
content_by = {(r['nick']): r for r in m_final}
for v in sb_final:
    mrow = content_by.get(v['nick'])
    if not mrow: continue
    img, rep = svg_img(mrow['content'], f"Capivara de {v['nick']}")
    if img:
        gallery.append((v['rank'], v['nick'], mrow['model'], v['total'], v['n'], img, rep))
    if len(gallery) >= 9: break
# vencedora da rodada 1 também
r1_content = {r['nick']: r for r in m_r1}
w1 = v_r1[0]
img1, img1_rep = (svg_img(r1_content[w1['nick']]['content'], 'Capivara vencedora da rodada 1') if w1['nick'] in r1_content else (None, False))

# top TPS do dia (todas as rodadas, min 100 tokens p/ evitar bursts vazios)
all_m = [r for src in (m_r1, m_aq, m_final, m_soneto) for r in src if r['tps'] and r['tokens'] >= 100]
best_by_nick = {}
for r in all_m:
    if r['nick'] not in best_by_nick or r['tps'] > best_by_nick[r['nick']]['tps']:
        best_by_nick[r['nick']] = r
top_tps = sorted(best_by_nick.values(), key=lambda r: -r['tps'])[:8]

soneto_kai = next(r for r in m_soneto if r['nick'] == 'kai')
soneto_gui = next(r for r in m_soneto if r['nick'] == 'Guilherme Rocha')
def poem(content):
    txt = re.sub(r'^Com certeza.*?:\s*', '', content.strip(), flags=re.S)
    return '<br>'.join(esc(l) for l in txt.strip().splitlines())

world_total = sum(world_join_10m.values())
best_emo = ' '.join(f'{e}×{n}' for e, n in emo.most_common(8))

charts = {
 'activity': timeseries_chart(req, annotations=[
    ('World aberto', '10:58', 14),
    ('Rodada I — Capivara', '11:18', 34),
    ('Votação + rate limit', '11:25', 54),
    ('Grande Final', '11:33', 14),
    ('Soneto', '11:41', 74),
 ]),
 'final': hbar_chart(sb_final, 'total',
    lambda r: r['nick'],
    lambda r, short=False: (f"{r['total']} pts" if short else f"{r['nick']} — {r['total']} pts · {r['n']} votos · média {r['avg']:.2f}")),
 'r1': hbar_chart(sb_r1, 'total',
    lambda r: r['nick'],
    lambda r, short=False: (f"{r['total']} pts" if short else f"{r['nick']} — {r['total']} pts · {r['n']} votos · média {r['avg']:.2f}")),
 'tps': hbar_chart(top_tps, 'tps',
    lambda r: f"{r['nick']}",
    lambda r, short=False: (f"{r['tps']:.0f} tok/s" if short else f"{r['nick']} ({r['model']}) — {r['tps']:.1f} tok/s · {r['tokens']} tokens"),
    color='var(--series-2)', winner_color='var(--series-2)'),
}

stat_tiles = [
 (nicks, 'participantes na arena'),
 (len(ips), 'dispositivos na rede'),
 (models, 'modelos diferentes'),
 (completes, 'gerações concluídas'),
 (total_votes, f'votos de {voters} votantes'),
 (f'{total_req:,}'.replace(',','.'), 'requisições HTTP'),
 (world_total, 'entradas no World'),
 (f'{peak_val}', f'pico de req/min ({peak_min})'),
]
tiles_html = ''.join(f'<div class="tile"><div class="tile-v">{esc(v)}</div><div class="tile-l">{esc(l)}</div></div>' for v,l in stat_tiles)

timeline = [
 ('22/05 · noite', 'Ensaio geral', 'Na véspera, 8 sessões de teste: rodadas-piloto da capivara dançante (20h24–20h31, 26 participantes de teste) e o primeiro teste do modo World com logging automático (20h54).'),
 ('10:38', 'Servidor no ar', 'O servidor sobe no MacBook do organizador. Começa a chegada: participantes conectam seus notebooks rodando Ollama e LM Studio na rede local.'),
 ('10:48–11:15', 'World aberto 🌍', f'O novo modo World recebe {world_total} entradas de 54 criaturas ao longo do dia — pico entre 11h00 e 11h10. O bestiário do telão: {best_emo}.'),
 ('11:18', 'Rodada I — “Crie o SVG de uma capivara dançando frevo”', f'{len(m_r1)} modelos completam a geração. A plateia dá {sum(r["n"] for r in v_r1)} votos. Vence “{v_r1[0]["nick"]}” (média {v_r1[0]["avg"]:.2f}) — sim, o apelido era um teste de tamanho de nick que deu certo demais.'),
 ('11:25', 'O pico de votação vira incidente 🔥', f'A apuração da Rodada I derruba a votação no rate limit: {h429.get("11:25",0)} requisições bloqueadas com HTTP 429 em um único minuto ({total_429} no dia). O servidor é reiniciado às 11h26 e às 11h30 com sessões novas.'),
 ('11:31', 'Aquecimento da revanche', f'{len(m_aq)} modelos regeneram a capivara em uma rodada rápida de calibração.'),
 ('11:33', 'Grande Final da Capivara 🏆', f'{len(m_final)} gerações e {sum(r["n"] for r in v_final)} votos — a rodada mais disputada do dia. Almir (qwen3.5:2b) leva com {v_final[0]["total"]} pontos.'),
 ('11:39', 'Sessão final — 42 registros', 'Uma última sessão reúne todo mundo (com direito a tempestade de reconexões).'),
 ('11:40', 'Rodada do Soneto ✍️', f'“Escreva um soneto sobre modelos de linguagem”: {len(m_soneto)} modelos respondem. kai (gemma3:1b) termina primeiro, em {fmt_dur(soneto_kai["dur"])}. A rodada encerra sem votação — hora do almoço chegando.'),
 ('11:41–12:24', 'Encerramento', 'Desconexões graduais; últimos curiosos exploram o World. O dia registrou 400 desconexões e 336 reconexões automáticas deduplicadas.'),
 ('13:24', 'Luzes apagadas', 'Último snapshot automático gravado em disco e shutdown gracioso do servidor.'),
]
timeline_html = ''.join(
 f'<div class="tl-item"><div class="tl-time">{esc(t)}</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">{esc(ti)}</div><div class="tl-desc">{d}</div></div></div>'
 for t, ti, d in timeline)

def cap_fig(rank, nick, meta, img, rep):
    nota = ' · truncado no limite de tokens, restaurado' if rep else ''
    return (f'<figure class="cap"><div class="cap-img">{img}</div><figcaption>'
            f'<span class="cap-rank">{esc(rank)}</span> <strong>{esc(nick)}</strong><br>'
            f'<span class="cap-meta">{esc(meta)}{nota}</span></figcaption></figure>')
gallery_html = ''.join(cap_fig(rk, nk, f'{md} · {tot} pts · {n} votos', img, rep)
                       for rk, nk, md, tot, n, img, rep in gallery)
if img1:
    gallery_html = cap_fig('🥇 Rodada I', w1['nick'][:28] + '…', f'deepseek-r1 · média {w1["avg"]:.2f}', img1, img1_rep) + gallery_html

incidents = [
 ('critical', f'{total_429} requisições bloqueadas (HTTP 429)', f'Pico de {h429.get("11:25",0)}/min às 11h25, durante a apuração da Rodada I. O fix (isentar o localhost/proxy do telão do rate limit) já está no PR #8.'),
 ('warning', f'{len(starts)} inicializações do servidor', f'Servidor subiu às {", ".join(starts)} — reinícios para contornar o incidente da votação e recriar sessões.'),
 ('warning', f'{seq_mm} tokens fora de sequência descartados', 'Streams que chegaram com seq repetido/atrasado foram descartados pelo validador do hub, sem corromper o telão.'),
 ('good', f'{dedup} reconexões deduplicadas', 'O mecanismo de dedup fechou conexões velhas automaticamente a cada reconexão — a tempestade de reconexões de março não se repetiu.'),
 ('good', '5 falhas de geração isoladas', 'Erros pontuais de clientes (Ollama 500, “Failed to fetch”) reportados via mensagem de erro, sem derrubar rodadas.'),
]
icons = {'critical':'⛔','warning':'⚠️','good':'✅'}
incidents_html = ''.join(
 f'<div class="inc inc-{k}"><div class="inc-icon">{icons[k]}</div><div><div class="inc-t">{esc(t)}</div><div class="inc-d">{d}</div></div></div>'
 for k, t, d in incidents)

curios = [
 ('O nick que virou lenda', 'O vencedor da Rodada I se registrou como “Pedrin Matador Testando o tamanho dos nicks, pode deixar bem longo?” — o teste de UI venceu a rodada com média 3,67.'),
 ('Gambiarra pura', 'Entre os “modelos” registrados no dia: <code>FASTVLM_MODEL_PATH</code> (a variável de ambiente foi de brinde) e <code>ollama run smollm2</code> (o comando inteiro no campo do modelo). Homebrew Computer Club aprovaria.'),
 ('A maratonista', 'Mourinha (qwen3.5:0.8b) levou 5min56s gerando a capivara da final a 2,1 tok/s — terminou depois da votação abrir.'),
 ('O velocista', f'FelipeFarias (smollm2:135m) cuspiu 3.000 tokens em {fmt_dur(18738)} na final ({163.7:.0f} tok/s) — velocidade não é tudo: ficou com 8 pontos.'),
 ('Embedding não conversa', 'Bruna tentou competir com <code>text-embedding-nomic-embed-text-v1.5</code> antes de trocar para o gemma-4 — modelos de embedding não geram texto, mas a tentativa foi registrada para a posteridade.'),
 ('Primeiro a terminar o soneto', f'kai (gemma3:1b) entregou o soneto em {fmt_dur(soneto_kai["dur"])}, a {soneto_kai["tps"]:.0f} tok/s.'),
]
curios_html = ''.join(f'<div class="curio"><div class="curio-t">{t}</div><div class="curio-d">{d}</div></div>' for t,d in curios)

page = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gambiarra Arena — Encontro de 23/05/2026</title>
<style>
:root {{
  --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --series-1:#2a78d6; --series-1-strong:#1c5cab; --series-1-soft:#cde2fb;
  --series-2:#1baf7a; --crit:#d03b3b; --warn:#fab219; --good:#0ca30c;
}}
@media (prefers-color-scheme: dark) {{ :root {{
  --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --series-1:#3987e5; --series-1-strong:#6da7ec; --series-1-soft:#184f95;
  --series-2:#199e70;
}} }}
:root[data-theme="light"] {{
  --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --series-1:#2a78d6; --series-1-strong:#1c5cab; --series-1-soft:#cde2fb; --series-2:#1baf7a;
}}
:root[data-theme="dark"] {{
  --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --series-1:#3987e5; --series-1-strong:#6da7ec; --series-1-soft:#184f95; --series-2:#199e70;
}}
* {{ box-sizing:border-box; margin:0; }}
body {{ background:var(--page); color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.55; }}
.wrap {{ max-width:980px; margin:0 auto; padding:32px 20px 80px; }}
header.hero {{ padding:56px 0 28px; }}
.kicker {{ text-transform:uppercase; letter-spacing:.14em; font-size:13px; font-weight:700; color:var(--series-1); }}
h1 {{ font-size:clamp(30px,5vw,46px); line-height:1.12; margin:10px 0 8px; }}
.sub {{ color:var(--ink-2); font-size:17px; max-width:64ch; }}
h2 {{ font-size:24px; margin:56px 0 6px; }}
h3 {{ font-size:17px; margin:26px 0 6px; }}
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
.chart .bar {{ transition:opacity .15s; cursor:default; }}
.chart .bar:hover {{ opacity:.82; }}
.chart .line {{ fill:none; stroke:var(--series-1); stroke-width:2; stroke-linejoin:round; }}
.chart .area {{ fill:var(--series-1-soft); opacity:.55; }}
.chart .ann {{ stroke:var(--muted); stroke-width:1; stroke-dasharray:3 4; }}
.chart .annlab {{ fill:var(--ink-2); font-size:12px; font-weight:650; }}
.chart .hit {{ fill:transparent; }}
.chart .hit:hover {{ fill:var(--series-1); fill-opacity:.9; }}
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
.poems {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; margin-top:16px; }}
.poem {{ font-style:italic; color:var(--ink-2); font-size:14.5px; }}
.poem-by {{ font-style:normal; color:var(--muted); font-size:13px; margin-top:10px; }}
.inc {{ display:flex; gap:12px; padding:13px 0; border-bottom:1px solid var(--grid); }}
.inc:last-child {{ border-bottom:none; }}
.inc-icon {{ font-size:18px; line-height:1.4; }}
.inc-t {{ font-weight:700; }}
.inc-d {{ color:var(--ink-2); font-size:14.5px; }}
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
  <div class="kicker">Gambiarra LLM Club · Arena Local</div>
  <h1>O dia em que a capivara dançou frevo</h1>
  <p class="sub">Relatório do encontro de <strong>23 de maio de 2026</strong>, reconstruído a partir dos registros do servidor central — banco de dados, logs e snapshots. Uma manhã, {nicks} participantes, seus notebooks e {models} modelos de linguagem rodando localmente na mesma rede.</p>
  <div class="tiles">{tiles_html}</div>
</header>

<h2>A manhã, minuto a minuto</h2>
<p class="lede">Tráfego HTTP no servidor central (requisições por minuto). Cada pico conta uma parte da história: a abertura do World, as rodadas, e a votação que colocou o rate limit à prova.</p>
<div class="card">{charts['activity']}</div>

<h2>Linha do tempo</h2>
<div style="margin-top:20px">{timeline_html}</div>

<h2>🏆 Grande Final — “Crie o SVG de uma capivara dançando frevo”</h2>
<p class="lede">A rodada mais disputada do dia (11h33): {len(m_final)} gerações e {sum(r["n"] for r in v_final)} votos da plateia. Pontuação = soma dos votos (nota 0–5 por votante).</p>
<div class="card">{charts['final']}</div>

<h2>Galeria de capivaras</h2>
<p class="lede">As obras, exatamente como saíram dos modelos — SVGs gerados token a token, ao vivo, por modelos de menos de 10B rodando em notebooks.</p>
<div class="gallery">{gallery_html}</div>

<h2>Rodada I — a primeira capivara (11h18)</h2>
<p class="lede">{len(m_r1)} gerações, {sum(r["n"] for r in v_r1)} votos — e a apuração desta rodada derrubou a votação no rate limit (detalhes nos bastidores).</p>
<div class="card">{charts['r1']}</div>

<h2>✍️ Rodada do Soneto (11h40)</h2>
<p class="lede">“Escreva um soneto sobre modelos de linguagem.” {len(m_soneto)} modelos responderam; a rodada fechou o dia sem votação. Dois destaques:</p>
<div class="poems">
  <div class="card"><div class="poem">{poem(soneto_kai['content'])}</div><div class="poem-by">— kai · gemma3:1b · primeiro a terminar, em {fmt_dur(soneto_kai['dur'])}</div></div>
  <div class="card"><div class="poem">{poem(soneto_gui['content'])}</div><div class="poem-by">— Guilherme Rocha · qwen3.5 · {fmt_dur(soneto_gui['dur'])}</div></div>
</div>

<h2>⚡ Os mais rápidos do dia</h2>
<p class="lede">Velocidade média de geração (tokens/s) nas rodadas de 23/05, entre gerações com pelo menos 100 tokens. Modelos minúsculos voam — mas nem sempre pontuam.</p>
<div class="card">{charts['tps']}</div>

<h2>🌍 O World</h2>
<p class="lede">Estreia do modo World: um mundo compartilhado no telão onde cada participante entra como uma criatura. Foram {world_total} entradas de 54 criaturas — pico entre 11h00 e 11h10 — e um bestiário digno de zoológico: {best_emo}. O recordista de reentradas foi plnsc, com 20 idas e vindas.</p>

<h2>🔧 Bastidores (a parte gambiarra)</h2>
<p class="lede">O que o servidor aguentou — e o que aprendemos para o próximo encontro.</p>
<div class="card">{incidents_html}</div>

<h2>Curiosidades</h2>
<div class="curios">{curios_html}</div>

<footer>
  <p><strong>Fontes:</strong> banco <code>dev.db</code> (sessões, rodadas, métricas, votos e event log), logs estruturados do servidor (<code>server-2026-05-23.log</code>, 36.156 linhas) e snapshots automáticos de sessão. Ensaio da véspera (22/05) incluído na linha do tempo. Relatório gerado em 10/07/2026 para o encontro de 11/07/2026. 🐹💃</p>
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

os.makedirs(os.path.dirname(OUTPATH), exist_ok=True)
with open(OUTPATH, 'w') as f:
    f.write(page)
print('OK:', OUTPATH, f'{len(page)/1024:.0f} KB')
print('galeria:', len(gallery), '| final rows:', len(sb_final), '| r1 rows:', len(sb_r1), '| tps rows:', len(top_tps))
