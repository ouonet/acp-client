/**
 * Headless mock for 'vscode' API in Vitest environment
 */

export const Uri = {
  file: (path: string) => ({
    fsPath: path,
    path,
    scheme: 'file',
    toString: () => `file://${path}`,
  }),
  parse: (uri: string) => ({
    fsPath: uri.replace(/^file:\/\//, ''),
    path: uri,
    scheme: uri.startsWith('http') ? 'http' : 'file',
    toString: () => uri,
  }),
};

export const workspace = {
  fs: {
    readFile: async () => new Uint8Array(),
    writeFile: async () => {},
    delete: async () => {},
  },
};

export const window = {
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showWarningMessage: async () => undefined,
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
