import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

interface ModalDrawerProps {
  label: string;
  className: string;
  onClose: () => void;
  children: ComponentChildren;
}

export function ModalDrawer({ label, className, onClose, children }: ModalDrawerProps) {
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const siblings = Array.from(overlay.current?.parentElement?.children || []).filter(el => el !== overlay.current);
    const background = siblings.map(el => ({ el, inert: el.hasAttribute("inert") }));
    background.forEach(({ el }) => el.setAttribute("inert", ""));
    panel.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    return () => {
      background.forEach(({ el, inert }) => { if (!inert) el.removeAttribute("inert"); });
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); onClose(); return;
    }
    if (event.key !== "Tab") return;
    // Closed capability sections must not expose their hidden controls to Tab.
    const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]',
    ) || []).filter(el => !el.closest("[hidden], [inert]") && (!el.closest("details:not([open])") || el.matches("summary")));
    const first = focusable[0], last = focusable.at(-1);
    if (!first) { event.preventDefault(); panel.current?.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  return <div ref={overlay} className="drawer-overlay open" onClick={onClose}>
    <div ref={panel} className={`drawer-panel ${className}`} role="dialog" aria-modal="true" aria-label={label}
      tabIndex={-1} onClick={event => event.stopPropagation()} onKeyDown={keyDown}>
      {children}
    </div>
  </div>;
}
