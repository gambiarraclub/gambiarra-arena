// Runners de LLM local compartilhados pelos clientes de navegador.
// A geração fala DIRETO com o LLM da máquina do participante (Ollama,
// LM Studio ou llama.cpp) — por isso o CORS do LLM precisa estar liberado
// quando a página é servida do IP da arena (ver ui.js corsInstructions).
import { Log, Err } from './ui.js';
import { normalizeHttpUrl } from './net.js';

export const RUNNERS = {
  ollama:   { defaultUrl: 'http://localhost:11434' },
  lmstudio: { defaultUrl: 'http://localhost:1234' },
  llamacpp: { defaultUrl: 'http://localhost:8080' },
};

class BaseRunner {
  constructor(url, model) { this.baseUrl = normalizeHttpUrl(url); this.model = model; }
  async test() { throw new Error('not impl'); }
  async generate(prompt, opts, onToken, onThinking) { throw new Error('not impl'); }
}

export class OllamaRunner extends BaseRunner {
  async test() {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`); if (!r.ok) throw new Error('status ' + r.status);
      const d = await r.json(); Log.ok(`Ollama ok. Modelos: ${d.models?.map(m => m.name).join(', ') || 'nenhum'}`);
    } catch (e) { if (e.message.includes('fetch') || e.name === 'TypeError') { Err.corsHelp('ollama'); throw new Error(`Sem conexão com Ollama em ${this.baseUrl}.`); } throw e; }
  }
  async generate(prompt, opts, onToken, onThinking) {
    // think:false (padrão): queremos o CONTEÚDO direto, sem gastar tokens
    // "pensando". Com think ON, modelos de raciocínio (qwen3 etc.) mandam o
    // raciocínio em `thinking` e a resposta em `response` — dê num_predict
    // generoso ou a resposta final volta VAZIA.
    const think = opts.think ?? false;
    const r = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: true, think, options: { num_predict: opts.maxTokens || (think ? 512 : 400), temperature: opts.temperature ?? 0.8, seed: opts.seed } }),
    });
    if (!r.ok) throw new Error('Ollama ' + r.status + ': ' + await r.text());
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const ln of lines) { if (!ln.trim()) continue; try { const j = JSON.parse(ln); if (j.thinking && onThinking) onThinking(j.thinking); if (j.response) onToken(j.response); if (j.done) return; } catch (e) {} }
    }
  }
}

export class LMStudioRunner extends BaseRunner {
  async test() {
    try {
      const r = await fetch(`${this.baseUrl}/v1/models`); if (!r.ok) throw new Error('status ' + r.status);
      const d = await r.json(); Log.ok(`LM Studio ok. Modelos: ${d.data?.map(m => m.id).join(', ') || 'nenhum'}`);
    } catch (e) { if (e.message.includes('fetch') || e.name === 'TypeError') { Err.corsHelp('lmstudio'); throw new Error(`Sem conexão com LM Studio em ${this.baseUrl}.`); } throw e; }
  }
  async generate(prompt, opts, onToken) {
    const r = await fetch(`${this.baseUrl}/v1/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, max_tokens: opts.maxTokens || 400, temperature: opts.temperature ?? 0.8, seed: opts.seed, stream: true }),
    });
    if (!r.ok) throw new Error('LM Studio ' + r.status + ': ' + await r.text());
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const ln of lines) {
        const t = ln.trim(); if (!t.startsWith('data: ')) continue; const data = t.slice(6); if (data === '[DONE]') return;
        try { const j = JSON.parse(data); const tok = j.choices?.[0]?.text; if (tok) onToken(tok); } catch (e) {}
      }
    }
  }
}

export class LlamaCppRunner extends BaseRunner {
  async test() {
    try { const r = await fetch(`${this.baseUrl}/health`); if (!r.ok) throw new Error('status ' + r.status); Log.ok('llama.cpp ok'); }
    catch (e) { if (e.message.includes('fetch') || e.name === 'TypeError') { Err.corsHelp('llamacpp'); throw new Error(`Sem conexão com llama.cpp em ${this.baseUrl}.`); } throw e; }
  }
  async generate(prompt, opts, onToken) {
    const r = await fetch(`${this.baseUrl}/completion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, n_predict: opts.maxTokens || 400, temperature: opts.temperature ?? 0.8, seed: opts.seed ?? -1, stream: true }),
    });
    if (!r.ok) throw new Error('llama.cpp ' + r.status + ': ' + await r.text());
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const ln of lines) {
        const t = ln.trim(); if (!t.startsWith('data: ')) continue; const data = t.slice(6); if (data === '[DONE]') return;
        try { const j = JSON.parse(data); if (j.content) onToken(j.content); if (j.stop) return; } catch (e) {}
      }
    }
  }
}

export function makeRunner(type, url, model) {
  return type === 'lmstudio' ? new LMStudioRunner(url, model) : type === 'llamacpp' ? new LlamaCppRunner(url, model) : new OllamaRunner(url, model);
}

/**
 * Lista os modelos instalados no LLM local. Lança em caso de falha — quem
 * chama decide como avisar (o combobox continua aceitando digitação livre).
 */
export async function discoverModels(runnerType, baseUrl) {
  const base = normalizeHttpUrl(baseUrl);
  if (runnerType === 'lmstudio' || runnerType === 'llamacpp') {
    const r = await fetch(base + '/v1/models'); if (!r.ok) throw new Error('status ' + r.status);
    const d = await r.json(); return (d.data || []).map((m) => m.id);
  }
  const r = await fetch(base + '/api/tags'); if (!r.ok) throw new Error('status ' + r.status);
  const d = await r.json(); return (d.models || []).map((m) => m.name);
}
