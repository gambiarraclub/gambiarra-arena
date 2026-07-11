// Cliente WebSocket da arena com reconexão exponencial — compartilhado pelos
// dois clientes de navegador. As mensagens específicas de cada modo (desafio
// vs. world) são registradas via on(type, handler).
import { Log } from './ui.js';

export class ArenaClient {
  constructor() {
    this.ws = null; this.attempts = 0; this.shouldReconnect = true;
    this.handlers = {}; this.onClose = null; this.onGiveUp = null;
    this.getRegisterPayload = null; // função que monta o payload de register (reavaliada a cada reconexão)
  }

  on(type, fn) { this.handlers[type] = fn; return this; }

  connect(url) {
    return new Promise((res, rej) => {
      this.shouldReconnect = true;
      try { this.ws = new WebSocket(url); } catch (e) { rej(new Error('URL inválida')); return; }
      const to = setTimeout(() => { rej(new Error('Timeout ao conectar')); this.ws?.close(); }, 15000);
      this.ws.onopen = () => { clearTimeout(to); this.attempts = 0; Log.ok('WebSocket conectado'); res(); };
      this.ws.onmessage = (ev) => { try { this.handle(JSON.parse(ev.data)); } catch (e) { Log.err('parse: ' + e.message); } };
      this.ws.onclose = (e) => { Log.warn('WS fechado: ' + e.code); this.onClose?.(); if (this.shouldReconnect) this.reconnect(url); };
      this.ws.onerror = () => { clearTimeout(to); rej(new Error('Erro ao conectar ao servidor')); };
    });
  }

  handle(m) {
    if (m.type === 'error') Log.err('servidor: ' + m.message);
    if (m.type === 'heartbeat' || m.type === 'registered_telao') return;
    this.handlers[m.type]?.(m);
  }

  send(d) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(d)); }

  register() {
    const payload = this.getRegisterPayload?.();
    if (payload) this.send({ type: 'register', ...payload });
  }

  reconnect(url) {
    if (this.attempts >= 15) { Log.err('Máximo de reconexões'); this.onGiveUp?.(); return; }
    this.attempts++; const delay = Math.min(1000 * 2 ** (this.attempts - 1), 15000); Log.warn(`Reconectando em ${delay}ms`);
    setTimeout(() => { if (this.shouldReconnect) this.connect(url).then(() => this.register()).catch((e) => Log.err('reconexão: ' + e.message)); }, delay);
  }

  disconnect() { this.shouldReconnect = false; this.ws?.close(); this.ws = null; }
}
