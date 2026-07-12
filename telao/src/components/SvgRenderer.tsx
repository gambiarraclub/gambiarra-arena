import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface SvgRendererProps {
  content: string;
  isGenerating: boolean;
}

/**
 * Extracts SVG content from a string using regex.
 * Only returns the content between <svg> and </svg> tags.
 */
export function extractSvg(content: string): string | null {
  // Match SVG tags with all content between them
  // This regex captures from <svg> to </svg>, allowing for attributes and nested content
  const svgRegex = /<svg[\s\S]*?<\/svg>/i;
  const match = content.match(svgRegex);

  if (match) {
    return match[0];
  }

  // If no closing tag found but we have an opening tag, try to render partial SVG
  const partialRegex = /<svg[\s\S]*$/i;
  const partialMatch = content.match(partialRegex);

  if (partialMatch) {
    // Add a closing tag to make it valid HTML
    return partialMatch[0] + '</svg>';
  }

  return null;
}

/**
 * Make an extracted SVG scale to its container. Browsers size an inline SVG
 * by its width/height attributes — models emit arbitrary fixed values (e.g.
 * width="200"), which rendered tiny on voting phones. Move the dimensions
 * into a viewBox and strip the fixed size so the .svg-fit CSS drives it.
 */
export function fitSvg(svg: string): string {
  const openTagMatch = svg.match(/<svg[^>]*>/i);
  if (!openTagMatch) return svg;

  let openTag = openTagMatch[0];
  const hasViewBox = /viewBox\s*=/i.test(openTag);
  const width = openTag.match(/\swidth\s*=\s*["']?([\d.]+)/i)?.[1];
  const height = openTag.match(/\sheight\s*=\s*["']?([\d.]+)/i)?.[1];

  if (!hasViewBox && width && height) {
    openTag = openTag.replace(/<svg/i, `<svg viewBox="0 0 ${width} ${height}"`);
  }

  // Drop fixed dimensions so CSS can scale the drawing
  openTag = openTag
    .replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(width|height)\s*=\s*'[^']*'/gi, '');

  return svg.replace(openTagMatch[0], openTag);
}

const LEAF_SHAPES = new Set([
  'rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'use', 'image',
]);

/**
 * Small local models emit malformed attributes — e.g. `linewidth=2/>`, where
 * the unquoted value swallows the self-closing slash. The shape then parses
 * as an open container and the REST OF THE DRAWING nests inside it, which SVG
 * never renders (blank white card, 2026-07-12 fcac-windows case). Reparse
 * leniently and hoist anything trapped inside a leaf shape back out.
 */
export function repairSvg(svg: string): string {
  if (typeof DOMParser === 'undefined') return svg;
  try {
    const doc = new DOMParser().parseFromString(`<body>${svg}</body>`, 'text/html');
    const root = doc.body.querySelector('svg');
    if (!root) return svg;

    let changed = false;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (LEAF_SHAPES.has(el.tagName.toLowerCase()) && el.childNodes.length > 0) {
        const parent = el.parentNode;
        if (!parent) continue;
        const anchor = el.nextSibling;
        while (el.firstChild) parent.insertBefore(el.firstChild, anchor);
        changed = true;
      }
    }

    return changed ? root.outerHTML : svg;
  } catch {
    return svg;
  }
}

interface SvgFitBoxProps {
  svg: string;
  className: string;
  /** Skip the blank check while tokens are still streaming */
  checkBlank?: boolean;
  /** Rendered instead of the drawing when nothing visible painted */
  fallback?: ReactNode;
}

/**
 * Shared SVG box for telão/voting/scoreboard: repairs + fits the drawing,
 * then measures what actually painted. If the geometry is empty or lies
 * entirely outside the viewBox, shows `fallback` instead of a silent white
 * rectangle the audience can't judge.
 */
export function SvgFitBox({ svg, className, checkBlank = true, fallback }: SvgFitBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html = useMemo(() => fitSvg(repairSvg(svg)), [svg]);
  // Verdict is keyed by the html it was measured on, so a new svg (e.g. the
  // voting page moving to the next participant) automatically re-renders the
  // container and re-measures instead of staying stuck on a stale "blank"
  const [verdict, setVerdict] = useState<{ html: string; blank: boolean } | null>(null);
  const blank = checkBlank && verdict?.html === html && verdict.blank;

  useEffect(() => {
    if (!checkBlank) return;
    const el = containerRef.current?.querySelector('svg');
    if (!el) {
      setVerdict({ html, blank: true });
      return;
    }
    try {
      const box = el.getBBox();
      let visible = box.width > 0 && box.height > 0;
      const vb = el.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
      if (visible && vb && vb.length === 4 && !vb.some(Number.isNaN)) {
        // Geometry drawn entirely off-canvas is just as blank as no geometry
        visible =
          box.x < vb[0] + vb[2] &&
          box.x + box.width > vb[0] &&
          box.y < vb[1] + vb[3] &&
          box.y + box.height > vb[1];
      }
      setVerdict({ html, blank: !visible });
    } catch {
      // getBBox unsupported/detached — assume it rendered
      setVerdict({ html, blank: false });
    }
  }, [html, checkBlank]);

  if (blank && fallback) {
    return <>{fallback}</>;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function SvgRenderer({ content, isGenerating }: SvgRendererProps) {
  const svgContent = useMemo(() => extractSvg(content), [content]);

  if (!svgContent) {
    return (
      <div className="mt-4 p-4 bg-gray-900 rounded border border-gray-700">
        <div className="text-center text-gray-500">
          {isGenerating ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
              <span className="text-sm">Aguardando SVG...</span>
            </div>
          ) : (
            <span className="text-sm">Nenhum SVG detectado</span>
          )}
        </div>
        {/* Show raw response when no SVG found */}
        {content && (
          <details className="mt-2">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
              Ver resposta recebida
            </summary>
            <pre className="text-xs text-gray-400 mt-2 p-2 bg-gray-800 rounded overflow-x-auto whitespace-pre-wrap">
              {content}
            </pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-gray-900 rounded border border-primary">
      <div className="mb-2 flex items-center gap-2">
        {isGenerating ? (
          <>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-green-400">Construindo imagem...</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-xs text-blue-400">Imagem concluída</span>
          </>
        )}
      </div>

      <SvgFitBox
        svg={svgContent}
        checkBlank={!isGenerating}
        className="svg-fit flex items-center justify-center bg-white rounded p-4 min-h-[200px]"
        fallback={
          <div className="flex items-center justify-center bg-yellow-900/20 border border-yellow-700 rounded p-4 min-h-[200px]">
            <span className="text-yellow-500 text-sm font-mono text-center">
              ⚠️ SVG recebido, mas nada visível ao renderizar
            </span>
          </div>
        }
      />

      {/* Debug toggles */}
      <div className="mt-2 flex gap-4">
        <details>
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
            Ver código SVG
          </summary>
          <pre className="text-xs text-gray-400 mt-2 p-2 bg-gray-800 rounded overflow-x-auto">
            {svgContent}
          </pre>
        </details>
        <details>
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
            Ver resposta recebida
          </summary>
          <pre className="text-xs text-gray-400 mt-2 p-2 bg-gray-800 rounded overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        </details>
      </div>
    </div>
  );
}

export default SvgRenderer;
