export interface PackedAgentTabs {
  visible: number[];
  overflow: number[];
}

export function packAgentTabs(
  widths: readonly number[],
  containerWidth: number,
  menuWidth: number,
  gap: number,
): PackedAgentTabs {
  const count = widths.length;
  if (count === 0) return { visible: [], overflow: [] };
  const total =
    widths.reduce((sum, width) => sum + width, 0) + gap * (count - 1);
  if (total <= containerWidth)
    return { visible: widths.map((_, index) => index), overflow: [] };
  const budget = containerWidth - menuWidth;
  const visible: number[] = [];
  let used = 0;
  if (budget > 0) {
    for (let index = 0; index < count; index++) {
      const delta = visible.length === 0 ? widths[index] : gap + widths[index];
      if (used + delta > budget) break;
      visible.push(index);
      used += delta;
    }
  }
  return {
    visible,
    overflow: widths.map((_, index) => index).slice(visible.length),
  };
}
