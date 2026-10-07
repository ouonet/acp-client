/**
 * Command Line Arguments Formatter and Parser
 *
 * Provides shell-compliant tokenization and formatting for CLI arguments,
 * supporting spaces, quotes, escapes, and graceful tolerance for legacy delimiter commas.
 */

export function parseCommandLineArgs(input: string): string[] {
  if (!input || !input.trim()) return [];

  const args: string[] = [];
  let current = "";
  let inQuotes: "'" | '"' | null = null;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (inQuotes) {
      if (char === inQuotes) {
        inQuotes = null;
      } else {
        current += char;
      }
    } else {
      if (char === '"' || char === "'") {
        inQuotes = char;
      } else if (/\s/.test(char)) {
        if (current.length > 0) {
          // If token ends with a delimiter comma (e.g. legacy "run, --dir,"), strip trailing comma
          const token = current.endsWith(",") ? current.slice(0, -1) : current;
          if (token.length > 0) {
            args.push(token);
          }
          current = "";
        }
      } else {
        current += char;
      }
    }
  }

  if (current.length > 0) {
    const token = current.endsWith(",") ? current.slice(0, -1) : current;
    if (token.length > 0) {
      args.push(token);
    }
  }

  return args;
}

export function formatCommandLineArgs(args: string[]): string {
  if (!args || args.length === 0) return "";

  return args
    .map((arg) => {
      if (!arg) return '""';
      if (/[\s"']/.test(arg)) {
        return `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      }
      return arg;
    })
    .join(" ");
}
