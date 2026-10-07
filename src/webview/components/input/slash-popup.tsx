import { useEffect, useRef } from "preact/hooks";
import type { AvailableCommand } from "../../../core/types/session";

export interface SlashMenuItem {
  name: string;
  description?: string;
  kind: "agent" | "skill";
}

export function filterSlashItems(
  query: string,
  commands: AvailableCommand[] = [],
  skills: Array<{ id?: string; name: string; description: string }> = [],
): SlashMenuItem[] {
  const cleanQuery = query.replace(/^\//, "").toLowerCase().trim();
  const seen = new Set<string>();
  const items: SlashMenuItem[] = [
    ...commands.map((command) => ({
      name: command.name,
      description: command.description,
      kind: "agent" as const,
    })),
    ...skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      kind: "skill" as const,
    })),
  ];

  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return (
      cleanQuery.length === 0 ||
      item.name.toLowerCase().includes(cleanQuery) ||
      item.description?.toLowerCase().includes(cleanQuery)
    );
  });
}

export function SlashPopup({
  query,
  commands = [],
  skills = [],
  activeIndex = 0,
  onSelect,
}: {
  query: string;
  commands?: AvailableCommand[];
  skills?: Array<{ id?: string; name: string; description: string }>;
  activeIndex?: number;
  onSelect: (commandName: string) => void;
}) {
  const filtered = filterSlashItems(query, commands, skills);
  const selected =
    filtered.length === 0
      ? 0
      : ((activeIndex % filtered.length) + filtered.length) % filtered.length;
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = activeRef.current;
    const list = node?.closest(".slash-list");
    if (!node || !(list instanceof HTMLElement)) return;
    const listRect = list.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    if (nodeRect.top < listRect.top) {
      list.scrollTop -= listRect.top - nodeRect.top;
    } else if (nodeRect.bottom > listRect.bottom) {
      list.scrollTop += nodeRect.bottom - listRect.bottom;
    }
  }, [selected, query]);

  if (filtered.length === 0) return null;

  return (
    <div
      className="slash-popup card"
      role="listbox"
      aria-label="Slash commands"
      aria-activedescendant={`slash-option-${selected}`}
    >
      <div className="slash-header">Commands & Skills</div>
      <div className="slash-list">
        {filtered.map((item, index) => {
          const isActive = index === selected;
          return (
            <button
              key={item.name}
              id={`slash-option-${index}`}
              type="button"
              role="option"
              aria-selected={isActive}
              ref={isActive ? activeRef : undefined}
              className={isActive ? "slash-item active" : "slash-item"}
              onClick={() => onSelect(item.name)}
            >
              <span className="slash-name">/{item.name}</span>
              <span className="slash-badge badge">{item.kind}</span>
              {item.description && <span className="slash-desc">{item.description}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
