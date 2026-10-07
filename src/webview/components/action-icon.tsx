import { ICONS } from "./icons";

/** Static shared SVG artwork; action names belong on the enclosing control. */
export function ActionIcon({ name }: { name: keyof typeof ICONS }) {
  const markup = ICONS[name].replace(
    "<svg ",
    '<svg aria-hidden="true" focusable="false" ',
  );
  return (
    <span
      className="action-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
