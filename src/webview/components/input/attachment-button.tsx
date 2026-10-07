import { useRef } from "preact/hooks";
import { ICONS } from "../icons";
import type { AttachmentItem } from "../../state/types";
import { readImageAttachment } from "./read-image-attachment";

export function AttachmentButton({
  onAttach,
}: {
  onAttach: (item: AttachmentItem) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInput = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    void readImageAttachment(file).then((item) => {
      onAttach(item);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileInput}
      />
      <button
        type="button"
        className="btn-attach"
        onClick={() => fileInputRef.current?.click()}
        title="Attach image"
        dangerouslySetInnerHTML={{ __html: ICONS.attach }}
      />
    </>
  );
}
