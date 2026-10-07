import { useEffect, useState } from "preact/hooks";
import type { AttachmentItem } from "../../state/types";

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: AttachmentItem[];
  onRemove: (id: string) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = attachments.find((item) => item.id === previewId) ?? null;

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview]);

  if (attachments.length === 0) return null;

  return (
    <div className="attachment-chips-bar">
      {attachments.map((item) => (
        <div key={item.id} className="attachment-chip">
          <button
            type="button"
            className="chip-open"
            onClick={() => setPreviewId(item.id)}
          >
            {item.name || "image"}
          </button>
          <button
            type="button"
            className="chip-remove"
            onClick={() => {
              if (previewId === item.id) setPreviewId(null);
              onRemove(item.id);
            }}
            title="Remove attachment"
            aria-label="Remove attachment"
          >
            ×
          </button>
        </div>
      ))}
      {preview && (
        <div
          className="attachment-lightbox"
          role="dialog"
          aria-label={preview.name || "image"}
          onClick={() => setPreviewId(null)}
        >
          <img
            src={`data:${preview.mimeType};base64,${preview.data}`}
            alt={preview.name || "Attachment"}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
