import { useEffect, useRef } from "preact/hooks";

export function useHeaderMenus() {
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (menu: HTMLDetailsElement, restoreFocus = false) => {
      if (!menu.open) return;
      menu.open = false;
      if (restoreFocus) menu.querySelector<HTMLElement>("summary")?.focus();
    };
    const click = (event: MouseEvent) => {
      const target = event.target as Element;
      const selected = target.closest?.(".header-menu");
      header.current?.querySelectorAll<HTMLDetailsElement>(".header-menu").forEach(menu => {
        if (menu !== selected) close(menu);
        else if (target.closest(".menu-content button")) close(menu, true);
      });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const menu = header.current?.querySelector<HTMLDetailsElement>(".header-menu[open]");
      if (menu) { event.preventDefault(); close(menu, true); }
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return header;
}
