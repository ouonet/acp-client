import { useEffect, useMemo, useRef } from "preact/hooks";
import { renderMarkdown } from "../../utils/markdown-renderer";
import { useAction } from "../../state/action-context";
import { ICONS } from "../icons";

let diagramId = 0;

/** Owns only Markdown HTML, diagram effects, and structured link actions. */
export function MarkdownBody({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  const ref = useRef<HTMLDivElement>(null);
  const sendAction = useAction();
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); }, []);
  useEffect(() => {
    const root = ref.current;
    if (!root || isStreaming) return;
    const wrappers = Array.from(root.querySelectorAll<HTMLElement>(".mermaid-diagram-wrapper"));
    if (!wrappers.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        if (cancelled) return;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: document.body.classList.contains("vscode-light") ? "default" : "dark" });
        for (const wrapper of wrappers) {
          if (cancelled) return;
          const target = wrapper.querySelector(".mermaid-svg-container");
          const code = wrapper.dataset.mermaidCode;
          if (!target || !code) continue;
          try {
            const { svg } = await mermaid.render(`acp-markdown-${++diagramId}`, code);
            // An earlier streamed response must never overwrite newer content.
            if (!cancelled && root.contains(target)) target.innerHTML = svg;
          } catch {
            // Invalid diagrams retain their readable source and copy action.
          }
        }
      } catch {
        // Leave source readable if the renderer cannot load.
      }
    })();
    return () => { cancelled = true; };
  }, [html, isStreaming]);

  const openFile = (link: HTMLElement) => {
    const filePath = link.dataset.path;
    if (!filePath) return;
    sendAction({ type: "OPEN_FILE", payload: {
      filePath,
      startLine: link.dataset.startLine ? Number(link.dataset.startLine) : undefined,
      endLine: link.dataset.endLine ? Number(link.dataset.endLine) : undefined,
    } });
  };
  const handleClick = async (event: MouseEvent) => {
    const target = event.target as Element;
    const link = target.closest<HTMLElement>(".file-path-link");
    if (link) { event.preventDefault(); openFile(link); return; }
    const button = target.closest<HTMLButtonElement>('[data-action="copy-code"]');
    const wrapper = button?.closest<HTMLElement>(".code-block-wrapper, .mermaid-diagram-wrapper, .plantuml-diagram-wrapper");
    if (!button || !wrapper) return;
    const code = wrapper.dataset.mermaidCode ?? wrapper.dataset.plantumlCode ?? wrapper.querySelector("code")?.textContent ?? "";
    const icon = button.querySelector(".action-icon");
    const feedback = (artwork: string, description: string) => {
      if (icon) icon.innerHTML = artwork.replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
      button.setAttribute("aria-label", description);
      button.title = description;
    };
    try {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(code);
      if (!ref.current?.contains(button)) return;
      feedback(ICONS.check, "Copied code");
      const timer = setTimeout(() => {
        feedback(ICONS.copy, "Copy code");
        timers.current.delete(timer);
      }, 1500);
      timers.current.add(timer);
    } catch {
      feedback(ICONS.copy, "Retry copy");
    }
  };
  return <div ref={ref} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }}
    onClick={handleClick}
    onKeyDown={(event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const link = (event.target as Element).closest<HTMLElement>(".file-path-link");
      if (link) { event.preventDefault(); openFile(link); }
    }} />;
}
