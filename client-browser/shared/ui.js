// Helpers de UI compartilhados pelos clientes de navegador (/client e /agent).
// Dependem dos elementos #errors, #log e #status presentes nas duas páginas.

export const $ = (id) => document.getElementById(id);

/**
 * Detecta a plataforma do participante pelo navegador, para mostrar a
 * instrução de CORS no formato do terminal que a pessoa realmente usa
 * (PowerShell no Windows vs. shell Unix). userAgentData quando existir;
 * cai para platform/userAgent nos navegadores que não o expõem.
 */
export function detectPlatform() {
  const uaPlatform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const ua = navigator.userAgent || '';
  if (/win/i.test(uaPlatform) || /Windows/i.test(ua)) return 'windows';
  if (/mac/i.test(uaPlatform) || /Mac OS/i.test(ua)) return 'mac';
  return 'linux';
}

/**
 * Instrução para liberar o CORS do LLM local, específica por runner e
 * plataforma. No evento de 23/05 vários participantes travaram aqui: a página
 * vem do IP da arena, e o Ollama por padrão só aceita origens localhost.
 */
export function corsInstructions(runner) {
  if (runner === 'lmstudio') return 'Habilite "Enable CORS" nas configurações do servidor do LM Studio (aba Developer).';
  if (runner === 'llamacpp') return 'Reinicie o llama.cpp com: --cors-allowed-origins "*"';
  // ollama
  const platform = detectPlatform();
  if (platform === 'windows') {
    return 'No PowerShell: feche o Ollama (ícone da bandeja → Quit), rode  $env:OLLAMA_ORIGINS="*"  e depois  ollama serve  na MESMA janela. Para deixar permanente: setx OLLAMA_ORIGINS "*" e reinicie o Ollama.';
  }
  if (platform === 'mac') {
    return 'No Terminal: feche o app do Ollama e rode  OLLAMA_ORIGINS="*" ollama serve  — ou rode  launchctl setenv OLLAMA_ORIGINS "*"  e reabra o Ollama.';
  }
  return 'No terminal: OLLAMA_ORIGINS="*" ollama serve — ou, se usa systemd: sudo systemctl edit ollama, adicione Environment="OLLAMA_ORIGINS=*" e reinicie o serviço.';
}

/**
 * O comando pronto para liberar o CORS, no shell da plataforma detectada —
 * usado no botão "copiar comando" (LM Studio não tem comando: é um toggle).
 */
export function corsCommand(runner) {
  if (runner === 'lmstudio') return null;
  if (runner === 'llamacpp') return 'llama-server --cors-allowed-origins "*"';
  return detectPlatform() === 'windows'
    ? '$env:OLLAMA_ORIGINS="*"; ollama serve'
    : 'OLLAMA_ORIGINS="*" ollama serve';
}

export const Err = {
  show(msg, type = 'error', ms = null) {
    const c = $('errors'); const a = document.createElement('div'); a.className = `alert alert-${type}`;
    const s = document.createElement('span'); s.textContent = msg; a.appendChild(s);
    const b = document.createElement('button'); b.innerHTML = '&times;'; b.onclick = () => a.remove(); a.appendChild(b);
    c.appendChild(a); if (ms || type !== 'error') setTimeout(() => a.remove(), ms || 7000);
    return a;
  },
  corsHelp(runner) {
    const a = this.show(`CORS bloqueado pelo LLM. ${corsInstructions(runner)}`, 'warning', 60000);
    const cmd = corsCommand(runner);
    if (cmd && navigator.clipboard) {
      const b = document.createElement('button');
      b.textContent = '📋 copiar comando';
      b.style.cssText = 'font-size:.78rem;opacity:1;border:1px solid currentColor;border-radius:6px;padding:.2rem .5rem;white-space:nowrap;align-self:center;';
      b.onclick = () => { navigator.clipboard.writeText(cmd); b.textContent = '✓ copiado!'; };
      a.insertBefore(b, a.lastChild);
    }
  },
};

export const Log = {
  add(m, t = 'info') { const el = $('log'); const d = document.createElement('div'); d.innerHTML = `<span style="color:var(--text-muted)">[${new Date().toLocaleTimeString()}]</span> <span class="lt-${t}">${m}</span>`; el.appendChild(d); el.scrollTop = el.scrollHeight; },
  info(m) { this.add(m, 'info'); }, ok(m) { this.add(m, 'success'); }, warn(m) { this.add(m, 'warning'); }, err(m) { this.add(m, 'error'); },
};

/**
 * Cria o setStatus da página. Só o rótulo do estado "playing" muda entre os
 * clientes ('Gerando...' no desafio, 'Jogando' no world).
 */
export function makeStatusSetter(playingLabel) {
  return function setStatus(state) {
    const map = {
      disconnected: ['Desconectado', 's-disconnected'], connecting: ['Conectando...', 's-connecting'],
      connected: ['Na arena', 's-connected'], playing: [playingLabel, 's-playing'], error: ['Erro', 's-error'],
    };
    const [txt, cls] = map[state] || map.disconnected;
    const b = $('status'); b.className = 'status-badge ' + cls; b.textContent = txt;
    const conn = state === 'connected' || state === 'playing';
    $('btn-connect').classList.toggle('hidden', conn);
    $('btn-disconnect').classList.toggle('hidden', !conn);
    $('live').classList.toggle('on', conn);
  };
}
