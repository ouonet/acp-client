import { deflateSync } from "fflate";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** Encode UTF-8 with raw DEFLATE and PlantUML's URL-safe alphabet. */
export function getPlantUmlSvgUrl(text: string): string {
  const trimmed = text.trim();
  const withTags = trimmed.startsWith("@startuml")
    ? trimmed
    : `@startuml\n${trimmed}\n@enduml`;
  const bytes = deflateSync(new TextEncoder().encode(withTags), { level: 9 });
  let encoded = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    encoded += alphabet[a >> 2];
    encoded += alphabet[((a & 3) << 4) | (b >> 4)];
    encoded += alphabet[((b & 15) << 2) | (c >> 6)];
    encoded += alphabet[c & 63];
  }
  return `https://www.plantuml.com/plantuml/svg/${encoded}`;
}
