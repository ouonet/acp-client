import { ICONS } from "../components/icons";
import { highlightCode } from "./syntax-highlighter";
import { getPlantUmlSvgUrl } from "./plantuml";
import { escapeHtml } from "./markdown-file-links";

const decorativeIcon = (svg: string) => `<span class="action-icon" aria-hidden="true">${svg.replace("<svg ", '<svg aria-hidden="true" focusable="false" ')}</span>`;
const copyButton = `<button type="button" class="code-action-btn action-icon-btn" data-action="copy-code" aria-label="Copy code" title="Copy code">${decorativeIcon(ICONS.copy)}</button>`;

export function createCodeBlockHtml(lang: string, code: string): string {
  const language = lang.toLowerCase();
  if (language === "mermaid") {
    return `<div class="mermaid-diagram-wrapper" data-mermaid-code="${escapeHtml(code)}"><div class="diagram-header"><span class="diagram-type">Mermaid Diagram</span>${copyButton}</div><div class="mermaid-svg-container"><pre>${escapeHtml(code)}</pre></div></div>`;
  }
  if (language === "plantuml") {
    const svgUrl = getPlantUmlSvgUrl(code);
    return `<div class="plantuml-diagram-wrapper" data-plantuml-code="${escapeHtml(code)}"><div class="diagram-header"><span class="diagram-type">PlantUML Diagram</span><div class="diagram-actions"><a href="${svgUrl}" target="_blank" rel="noopener noreferrer" class="code-action-btn action-icon-btn" aria-label="Open PlantUML SVG" title="Open PlantUML SVG">${decorativeIcon(ICONS.externalLink)}</a>${copyButton}</div></div><div class="plantuml-image-container"><img src="${svgUrl}" alt="PlantUML Diagram" loading="lazy" /></div></div>`;
  }
  return `<div class="code-block-wrapper"><div class="code-header"><div class="code-header-left"><span class="code-icon">&lt;/&gt;</span><span class="code-lang">${escapeHtml(lang)}</span></div><div class="code-header-actions">${copyButton}</div></div><pre class="code-block-pre"><code>${highlightCode(code, language)}</code></pre></div>`;
}
