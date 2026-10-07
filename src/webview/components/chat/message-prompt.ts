import type { ContentBlock } from "../../../core/types/session";
import type { AttachmentItem } from "../../state/types";

export function canRestorePrompt(content: string | ContentBlock[]): boolean {
  return typeof content === "string" || content.every(block => block.type === "text" || block.type === "image");
}

/** Convert only supported input kinds; callers must refuse lossy conversions. */
export function restorePrompt(content: string | ContentBlock[], id: string): { draft: string; attachments: AttachmentItem[] } {
  if (!canRestorePrompt(content)) throw new Error("Rewind supports text and images only");
  if (typeof content === "string") return { draft: content, attachments: [] };
  const attachments: AttachmentItem[] = [];
  const text: string[] = [];
  content.forEach((block, index) => {
    if (block.type === "text") text.push(block.text);
    if (block.type === "image") attachments.push({ id: `${id}-image-${index}`, type: "image", mimeType: block.mimeType, data: block.data, name: "Rewound image" });
  });
  return { draft: text.join("\n"), attachments };
}
