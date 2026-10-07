import type { AttachmentItem } from "../../state/types";

export function readImageAttachment(file: File): Promise<AttachmentItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read image"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const data = result.includes(",") ? result.split(",")[1] : result;
      resolve({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "image",
        mimeType: file.type || "image/png",
        data,
        name: file.name || "image",
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}
