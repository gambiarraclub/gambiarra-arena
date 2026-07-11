// Combobox de modelo compartilhado: <input list> + <datalist> + botão ⟳.
// Texto livre SEMPRE funciona (não trava o registro se a listagem falhar,
// como aconteceu em 23/05); o autocomplete aparece quando a listagem funciona.
import { $, Err, Log } from './ui.js';
import { discoverModels } from './runners.js';

/**
 * Busca os modelos instalados e popula o <datalist id="model-list">.
 * `interactive: true` (clique no ⟳ / Testar LLM) mostra a instrução de CORS
 * por plataforma quando a busca falha; chamadas automáticas (carregamento da
 * página, troca de runner) só registram no log para não virar spam de toast.
 */
export async function refreshModelList(S, { interactive = false } = {}) {
  const input = $('model'); const list = $('model-list'); const btn = $('btn-models');
  if (!input || !list) return [];
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const names = await discoverModels(S.runner, S.llmUrl);
    list.innerHTML = '';
    for (const n of names) { const o = document.createElement('option'); o.value = n; list.appendChild(o); }
    if (!input.value && names.length) { input.value = names[0]; S.model = names[0]; S.save(); }
    // Pegadinha do <datalist>: o navegador FILTRA as sugestões pelo texto já
    // digitado. Se o valor atual (ex.: modelo salvo de outra máquina) não está
    // na lista, a setinha abre "vazia". No clique do ⟳, limpamos o campo para
    // a lista inteira aparecer — o valor antigo vira placeholder recuperável.
    if (interactive && names.length && input.value && !names.includes(input.value)) {
      input.placeholder = input.value;
      input.value = ''; S.model = ''; S.save();
      input.focus();
      Err.show(`O modelo anterior não está nesta máquina — campo limpo para mostrar os ${names.length} da lista. Clique na setinha ou comece a digitar.`, 'warning', 7000);
    }
    if (names.length) Log.ok(`${names.length} modelo(s) encontrados no ${S.runner}`);
    else Log.warn(`nenhum modelo instalado no ${S.runner}`);
    if (interactive) Err.show(names.length ? `${names.length} modelo(s) encontrados` : 'Nenhum modelo instalado no LLM', names.length ? 'success' : 'warning', 4000);
    return names;
  } catch (e) {
    Log.warn('não foi possível listar modelos: ' + e.message);
    if (interactive) {
      Err.corsHelp(S.runner);
      Err.show('Não consegui listar os modelos — digite o nome manualmente que funciona igual.', 'warning', 8000);
    }
    return [];
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⟳'; }
  }
}

/** Liga o combobox: ⟳, troca de runner (com URL padrão) e troca de URL. */
export function wireModelPicker(S, RUNNERS, { onRunnerChange } = {}) {
  // Selecionar tudo ao focar: digitar substitui o valor antigo de uma vez
  // (e apagar com uma tecla revela a lista completa do datalist).
  $('model')?.addEventListener('focus', (e) => e.target.select());
  $('btn-models')?.addEventListener('click', () => refreshModelList(S, { interactive: true }));
  $('runner')?.addEventListener('change', (e) => {
    const u = RUNNERS[e.target.value]?.defaultUrl;
    if (u) { $('llm-url').value = u; S.llmUrl = u; S.save(); }
    onRunnerChange?.(e.target.value);
    refreshModelList(S);
  });
  $('llm-url')?.addEventListener('change', () => refreshModelList(S));
}
