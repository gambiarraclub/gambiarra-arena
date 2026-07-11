// Endereçamento e identidade compartilhados pelos clientes de navegador.

export function defaultServerHost() {
  // Quando o próprio servidor da arena serve a página, pré-preenche com o host
  // que a pessoa já digitou na barra de endereço.
  if (location.protocol.startsWith('http') && location.hostname) return location.hostname;
  return 'localhost';
}

/**
 * Garante protocolo em URLs digitadas à mão. No evento de 23/05, quem digitou
 * "127.0.0.1:41343" (sem http://) fazia o navegador tratar como caminho
 * RELATIVO — o fetch ia parar no servidor da arena e a listagem de modelos
 * falhava para sempre.
 */
export function normalizeHttpUrl(input) {
  let s = (input || '').trim().replace(/\/+$/, '');
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s.replace(/^\/+/, '');
  return s;
}

// Aceita só o IP/hostname e monta a URL completa do WebSocket. Tolera também
// ws://… / http://… ou host:porta, pra ninguém travar.
export function buildWsUrl(input) {
  let s = (input || '').trim();
  if (!s) s = defaultServerHost();
  if (/^wss?:\/\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s); const pr = u.protocol === 'https:' ? 'wss' : 'ws';
      return `${pr}://${u.hostname}:${u.port || 3000}/ws`;
    } catch (e) { /* fall through */ }
  }
  s = s.replace(/^\/+/, '').replace(/\/.*$/, '');
  if (!/:\d+$/.test(s)) s += ':3000';
  return `ws://${s}/ws`;
}

// ID estável derivado do apelido + sufixo aleatório por navegador (evita que
// dois apelidos iguais colidam e se derrubem).
export function deriveId(nick, fallbackSlug = 'jogador') {
  const slug = (nick || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  let rnd = '';
  try {
    rnd = localStorage.getItem('gambiarra-aid') || '';
    if (!rnd) { rnd = Math.random().toString(36).slice(2, 6); localStorage.setItem('gambiarra-aid', rnd); }
  } catch (e) { rnd = Math.random().toString(36).slice(2, 6); }
  return (slug || fallbackSlug) + '-' + rnd + '_id';
}
