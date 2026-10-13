/**
 * Command Line Arguments Formatter and Parser
 *
 * Provides shell-compliant tokenization and formatting for CLI arguments,
 * supporting spaces, quotes, escapes, and graceful tolerance for legacy delimiter commas.
 *
 * Windows paths (e.g. `C:\Users\neo\...`, UNC `\\server\share`) keep their
 * backslashes literally. A backslash only escapes whitespace or a quote
 * outside quotes, or follows standard paired-backslash handling inside quotes.
 */

export function parseCommandLineArgs(input: string): string[] {
  if (!input || !input.trim()) return [];

  const args: string[] = [];
  let current = "";
  let tokenStarted = false;
  let inQuotes: "'" | '"' | null = null;

  const pushCurrent = (): void => {
    if (!tokenStarted) return;

    // If token ends with a delimiter comma (e.g. legacy "run, --dir,"), strip trailing comma.
    const isDelimiter = current.endsWith(",");
    const token = isDelimiter ? current.slice(0, -1) : current;
    if (token.length > 0 || !isDelimiter) {
      args.push(token);
    }
    current = "";
    tokenStarted = false;
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (char === "\\") {
      if (inQuotes) {
        // Inside quotes, an even run of backslashes before a quote leaves the
        // quote available to close the token; an odd run escapes the quote.
        let slashCount = 0;
        while (input[i + slashCount] === "\\") slashCount++;
        const quoteIndex = i + slashCount;
        if (input[quoteIndex] === inQuotes) {
          current += "\\".repeat(Math.floor(slashCount / 2));
          if (slashCount % 2 === 1) {
            current += inQuotes;
          } else {
            inQuotes = null;
          }
          tokenStarted = true;
          i = quoteIndex;
        } else {
          current += "\\".repeat(slashCount);
          tokenStarted = true;
          i += slashCount - 1;
        }
        continue;
      }

      // Outside quotes, backslash only escapes whitespace or a quote
      // (`hello\ world` -> `hello world`, `\"` -> `"`). Otherwise it is a
      // Windows separator and is preserved (`C:\Users`, `\\server\share`).
      if (next !== undefined && (/\s/.test(next) || next === '"' || next === "'")) {
        current += next;
        i++;
      } else {
        current += "\\";
      }
      tokenStarted = true;
      continue;
    }

    if (inQuotes) {
      if (char === inQuotes) {
        inQuotes = null;
      } else {
        current += char;
      }
      tokenStarted = true;
    } else if (char === '"' || char === "'") {
      inQuotes = char;
      tokenStarted = true;
    } else if (/\s/.test(char)) {
      pushCurrent();
    } else {
      current += char;
      tokenStarted = true;
    }
  }

  pushCurrent();
  return args;
}

export function formatCommandLineArgs(args: string[]): string {
  if (!args || args.length === 0) return "";

  return args
    .map((arg) => {
      if (!arg) return '""';
      if (/[\s"']/.test(arg)) {
        // Double backslashes immediately before a quote or the closing quote
        // so the parser preserves both the slash and the quote correctly.
        const escaped = arg
          .replace(/(\\*)"/g, (_match: string, slashes: string) => `${slashes}${slashes}\\"`)
          .replace(/(\\*)$/g, (_match: string, slashes: string) => slashes + slashes);
        return `"${escaped}"`;
      }
      return arg;
    })
    .join(" ");
}
