export interface ClipboardFileSource {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{
    kind: string;
    type: string;
    getAsFile: () => File | null;
  }> | null;
}

export function clipboardImageFiles(data: ClipboardFileSource | null): File[] {
  if (!data) return [];
  const listed = Array.from(data.files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
  if (listed.length > 0) return listed;
  return Array.from(data.items ?? []).flatMap((item) => {
    if (item.kind !== "file" || !item.type.startsWith("image/")) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}
