/**
 * Headless mock for 'vscode' API in Vitest environment
 */

export const Uri = {
  file: (path: string) => ({
    fsPath: path,
    path,
    scheme: "file",
    toString: () => `file://${path}`,
  }),
  parse: (uri: string) => ({
    fsPath: uri.replace(/^file:\/\//, ""),
    path: uri,
    scheme: uri.startsWith("http") ? "http" : "file",
    toString: () => uri,
  }),
};

export const workspace = {
  workspaceFolders: [
    {
      uri: {
        fsPath: "/mock/workspace",
        path: "/mock/workspace",
        scheme: "file",
        toString: () => "file:///mock/workspace",
      },
    },
  ],
  fs: {
    readFile: async () => new Uint8Array(),
    writeFile: async () => {},
    delete: async () => {},
    stat: async () => ({ type: 1, size: 100 }),
  },
  findFiles: async (
    _pattern: string,
    _exclude?: string,
    _maxResults?: number,
  ) => [],
  openTextDocument: async (uriOrPath: any) => ({
    uri: typeof uriOrPath === "string" ? Uri.file(uriOrPath) : uriOrPath,
    lineCount: 100,
    lineAt: (line: number) => ({ text: `line ${line} content` }),
  }),
};

export const window = {
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showTextDocument: async (doc: any, options?: any) => ({
    document: doc,
    selection: null,
    revealRange: () => {},
  }),
};

export class Range {
  constructor(
    public startLine: number,
    public startChar: number,
    public endLine: number,
    public endChar: number,
  ) {}
  get start() {
    return { line: this.startLine, character: this.startChar };
  }
  get end() {
    return { line: this.endLine, character: this.endChar };
  }
}

export class Selection {
  constructor(
    public start: any,
    public end: any,
  ) {}
}

export const ViewColumn = {
  One: 1,
  Two: 2,
  Active: -1,
  Beside: -2,
};

export const TextEditorRevealType = {
  Default: 0,
  InCenter: 1,
  InCenterIfOutsideViewport: 2,
  AtTop: 3,
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: async () => undefined,
};

export const chat = {
  createChatParticipant: (id: string, handler: any) => ({
    id,
    handler,
    dispose: () => {},
  }),
};
