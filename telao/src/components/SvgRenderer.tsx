import { useMemo } from 'react';

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

      <div
        className="svg-fit flex items-center justify-center bg-white rounded p-4 min-h-[200px]"
        dangerouslySetInnerHTML={{ __html: fitSvg(svgContent) }}
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
