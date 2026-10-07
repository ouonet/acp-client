declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it";
  import type { KatexOptions } from "katex";
  function texmath(md: MarkdownIt, options: {
    engine: { renderToString: (expression: string, options?: KatexOptions) => string };
    delimiters: string | string[];
    katexOptions?: KatexOptions;
  }): void;
  export default texmath;
}

declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  function taskLists(md: MarkdownIt, options?: { enabled?: boolean; label?: boolean }): void;
  export default taskLists;
}
