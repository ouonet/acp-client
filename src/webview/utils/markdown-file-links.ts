import { ICONS } from "../components/icons";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const knownExtensions = new Set("ts tsx js jsx json py md rs go java c cpp h hpp html css scss sass yaml yml toml sh bash zsh xml env sql vue rb php proto graphql swift kt lua".split(" "));

export function tryFormatFileLink(text: string, isCode = false): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(?:file:\/\/)?([a-zA-Z0-9_.\-\\/]+?\.[a-zA-Z0-9_-]{1,10})(?::(?:L|line\s*)?(\d+)(?:[-:]L?(\d+))?|#L(\d+)(?:-L?(\d+))?)?$/i);
  if (!match) return null;
  const rawPath = match[1];
  const extension = rawPath.split(".").pop()?.toLowerCase() || "";
  if (!rawPath.includes("/") && !rawPath.includes("\\") && !knownExtensions.has(extension)) return null;
  const start = match[2] || match[4];
  const end = match[3] || match[5];
  const lineAttributes = (start ? ` data-start-line="${start}"` : "") + (end ? ` data-end-line="${end}"` : "");
  const display = isCode ? `<code>${escapeHtml(trimmed)}</code>` : escapeHtml(trimmed);
  return `<span class="file-path-link" role="link" tabindex="0" data-path="${escapeHtml(rawPath)}"${lineAttributes} title="Open ${escapeHtml(rawPath)} in editor">${ICONS.file} ${display}</span>`;
}

export function formatPlainTextFilePaths(text: string): string {
  const pattern = /(?:^|(?<=[\s(（\["']))([a-zA-Z0-9_.\-\\/]+?\.(?:ts|tsx|js|jsx|json|py|md|rs|go|java|c|cpp|h|hpp|html|css|scss|yaml|yml|toml|sh|bash|xml|sql|vue|rb|php)(?::(?:L|line\s*)?\d+(?:-L?\d+)?|#L\d+(?:-L?\d+)?)?)(?=[)）\]"',;\s]|$)/gi;
  let output = "";
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index!;
    output += escapeHtml(text.slice(cursor, index));
    output += tryFormatFileLink(match[0]) || escapeHtml(match[0]);
    cursor = index + match[0].length;
  }
  return output + escapeHtml(text.slice(cursor));
}
