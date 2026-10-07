import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { getPlantUmlSvgUrl } from "../../src/webview/utils/plantuml";
import { renderMarkdown } from "../../src/webview/utils/markdown-renderer";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
function decodeUrl(url: string): string {
  const encoded = url.slice(url.lastIndexOf("/") + 1);
  expect(encoded).toMatch(/^[0-9A-Za-z_-]+$/);
  const standardBase64 = Array.from(encoded, (char) =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[alphabet.indexOf(char)],
  ).join("");
  return inflateRawSync(Buffer.from(standardBase64, "base64")).toString("utf8");
}
const longDiagram = "@startuml\n" + Array.from({ length: 250 }, (_, i) =>
  `Alice -> Bob: synthetic message ${i}`,
).join("\n") + "\n@enduml";

describe("PlantUML compressed diagram URLs", () => {
  it("keeps a long diagram request below the usual request-line budget", () => {
    const url = getPlantUmlSvgUrl(longDiagram);
    expect(url.length).toBeLessThan(4096);
  });

  it.each([
    "Alice -> Bob: hello",
    "@startuml\nAlice -> Bob: hello\n@enduml",
    '参与者 -> 服务: 中文请求 😀\n服务 --> 参与者: 完成',
    '  Alice -> Bob: preserve \\"quotes\\" and <tags>  ',
  ])("round-trips UTF-8 diagram source: %s", (source) => {
    const trimmed = source.trim();
    const expected = trimmed.startsWith("@startuml") ? trimmed : `@startuml\n${trimmed}\n@enduml`;
    expect(decodeUrl(getPlantUmlSvgUrl(source))).toBe(expected);
  });

  it("preserves every line of a long diagram through compression", () => {
    expect(decodeUrl(getPlantUmlSvgUrl(longDiagram))).toBe(longDiagram);
  });

  it("uses the compressed URL for the Markdown diagram preview and SVG link", () => {
    const url = getPlantUmlSvgUrl(longDiagram);
    const html = renderMarkdown("```plantuml\n" + longDiagram + "\n```");
    expect(html).toContain(`src="${url}"`);
    expect(html).toContain(`href="${url}"`);
    expect(html).not.toContain("/svg/~h");
  });
});
