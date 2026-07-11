// Extração e reparo de SVGs gerados pelos modelos. Gerações costumam parar no
// limite de tokens no MEIO do SVG (às vezes dentro de um atributo) — injetar o
// texto cru deixa o preview em branco. Aqui: corta no último tag completo,
// fecha os tags abertos e move width/height para viewBox para escalar via CSS.

// Formas SVG que os modelos costumam emitir sem fechar (<circle ...> sem "/").
// No parser HTML uma forma aberta vira PAI das seguintes — e filhos de circle/
// rect/etc. não renderizam, "engolindo" o resto do desenho. Autofechamos.
const SHAPE_TAGS = /<(circle|ellipse|rect|line|polyline|polygon|path|use|stop|image)\b((?:"[^"]*"|'[^']*'|[^>"'])*?)\s*>/gi;

function selfCloseShapes(svg) {
  return svg.replace(SHAPE_TAGS, (full, tag, attrs) =>
    attrs.trimEnd().endsWith('/') ? full : `<${tag}${attrs}/>`
  );
}

/**
 * Reconstrói cada tag mantendo apenas atributos bem-formados. Modelos emitem
 * aspas desbalanceadas (ex.: transform="rotate(45) fill:#D3DACC' />) — no
 * parser HTML a aspa nunca fechada ENGOLE os elementos seguintes inteiros.
 * Retokenizando no primeiro '>' e reemitindo name="value" normalizados, o
 * estrago fica contido no próprio tag em vez de devorar o resto do desenho.
 */
function rebuildTags(svg) {
  return svg.replace(/<([A-Za-z][\w:-]*)([^>]*)>/g, (full, name, rest) => {
    if (!rest || !/["'=]/.test(rest)) return full; // sem atributos: intacto
    const selfClose = /\/\s*$/.test(rest);
    const attrs = [];
    for (const m of rest.matchAll(/([\w:-]+)\s*=\s*(?:"([^"']*)"|'([^"']*)'|([^\s"'>\/]+))/g)) {
      const value = m[2] ?? m[3] ?? m[4] ?? '';
      attrs.push(`${m[1]}="${value.replace(/"/g, '&quot;')}"`);
    }
    return `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClose ? '/' : ''}>`;
  });
}

/** Extrai o <svg> do texto do modelo; repara se veio truncado. null se não há SVG. */
export function extractSvg(content) {
  if (!content) return null;
  const complete = content.match(/<svg[\s\S]*?<\/svg>/i);
  if (complete) return selfCloseShapes(rebuildTags(complete[0]));

  const partial = content.match(/<svg[\s\S]*$/i);
  if (!partial || !partial[0].includes('>')) return null;

  // Corta no último tag completo (descarta um tag/atributo cortado no meio)
  let frag = partial[0].slice(0, partial[0].lastIndexOf('>') + 1);
  // Comentário aberto sem fechamento engoliria o resto — descarta ele também
  if ((frag.match(/<!--/g) || []).length > (frag.match(/-->/g) || []).length) {
    frag = frag.slice(0, frag.lastIndexOf('<!--'));
  }

  // Fecha os tags ainda abertos, na ordem inversa
  frag = selfCloseShapes(rebuildTags(frag));
  const stack = [];
  for (const t of frag.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
    const close = t[1]; const name = t[2]; const attrs = t[3];
    if (close) {
      const i = stack.lastIndexOf(name);
      if (i >= 0) stack.length = i;
    } else if (!attrs.trimEnd().endsWith('/')) {
      stack.push(name);
    }
  }
  return frag + stack.reverse().map((n) => `</${n}>`).join('');
}

/**
 * Remove vetores de script do SVG para render inline seguro: <script>,
 * <foreignObject>, handlers on* e href com javascript:. Compõe com
 * rebuildTags (que já normaliza os atributos para name="value").
 */
export function sanitizeSvg(svg) {
  return svg
    .replace(/<script[\s\S]*?(<\/script>|$)/gi, '')
    .replace(/<style[\s\S]*?(<\/style>|$)/gi, '')
    .replace(/<foreignObject[\s\S]*?(<\/foreignObject>|$)/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\s(xlink:href|href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '');
}

/**
 * Mede a geometria REAL do desenho (getBBox) e devolve um viewBox que o
 * enquadra — modelos pequenos vivem desenhando em coordenadas negativas /
 * fora do viewBox declarado, o que deixava o preview "em branco".
 * Só sugere override quando o desenho está majoritariamente fora do quadro.
 * Browser-only (usa DOM); retorna null quando não é preciso ajustar.
 */
export function autoViewBox(svgMarkup) {
  if (typeof document === 'undefined') return null;
  // Remove scripts/handlers antes de tocar o DOM da página (o preview em si
  // continua indo para um iframe sandboxed).
  const clean = svgMarkup
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:400px;height:400px;visibility:hidden;';
  let box = null; let declared = null;
  try {
    host.innerHTML = clean;
    document.body.appendChild(host);
    const svg = host.querySelector('svg');
    if (svg) {
      const b = svg.getBBox();
      if (b.width > 0 && b.height > 0) box = b;
      const vb = svg.viewBox && svg.viewBox.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) declared = vb;
    }
  } catch (e) { /* medição é melhor-esforço */ }
  host.remove();
  if (!box) return null;

  // Quanto do desenho cabe no viewBox declarado? Se a maior parte está
  // dentro, respeita o autor; se está fora, enquadra pela geometria real.
  if (declared) {
    const ix = Math.max(0, Math.min(box.x + box.width, declared.x + declared.width) - Math.max(box.x, declared.x));
    const iy = Math.max(0, Math.min(box.y + box.height, declared.y + declared.height) - Math.max(box.y, declared.y));
    const visible = (ix * iy) / (box.width * box.height);
    if (visible >= 0.5) return null;
  }
  const pad = Math.max(box.width, box.height) * 0.06;
  return `${box.x - pad} ${box.y - pad} ${box.width + 2 * pad} ${box.height + 2 * pad}`;
}

/**
 * Move width/height fixos do <svg> para viewBox, para o CSS ditar o tamanho.
 * `viewBoxOverride` (de autoViewBox) força o enquadramento pela geometria real.
 */
export function fitSvg(svg, viewBoxOverride = null) {
  const openTagMatch = svg.match(/<svg[^>]*>/i);
  if (!openTagMatch) return svg;

  let openTag = openTagMatch[0];
  if (viewBoxOverride) {
    openTag = openTag.replace(/\sviewBox\s*=\s*"[^"]*"/gi, '').replace(/\sviewBox\s*=\s*'[^']*'/gi, '');
    openTag = openTag.replace(/<svg/i, `<svg viewBox="${viewBoxOverride}"`);
  } else {
    const hasViewBox = /viewBox\s*=/i.test(openTag);
    const width = openTag.match(/\swidth\s*=\s*["']?([\d.]+)/i)?.[1];
    const height = openTag.match(/\sheight\s*=\s*["']?([\d.]+)/i)?.[1];
    if (!hasViewBox && width && height) {
      openTag = openTag.replace(/<svg/i, `<svg viewBox="0 0 ${width} ${height}"`);
    }
  }
  openTag = openTag
    .replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(width|height)\s*=\s*'[^']*'/gi, '');

  return svg.replace(openTagMatch[0], openTag);
}
