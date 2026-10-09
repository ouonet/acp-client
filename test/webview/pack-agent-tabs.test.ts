import { expect, it } from "vitest";
import { packAgentTabs } from "../../src/webview/utils/pack-agent-tabs";

const menu = 32;
const gap = 4;

it("returns empty arrays when there are no tabs", () => {
  expect(packAgentTabs([], 100, menu, gap)).toEqual({
    visible: [],
    overflow: [],
  });
});

it("keeps a single tab that fits the full container", () => {
  expect(packAgentTabs([80], 100, menu, gap)).toEqual({
    visible: [0],
    overflow: [],
  });
});

it("overflows a single tab wider than the container", () => {
  expect(packAgentTabs([80], 70, menu, gap)).toEqual({
    visible: [],
    overflow: [0],
  });
});

it("keeps every tab on an exact fit without reserving the menu", () => {
  expect(packAgentTabs([100, 100, 100], 308, menu, gap)).toEqual({
    visible: [0, 1, 2],
    overflow: [],
  });
});

it("drops only the suffix when the row is one pixel short", () => {
  expect(packAgentTabs([100, 100, 100], 307, menu, gap)).toEqual({
    visible: [0, 1],
    overflow: [2],
  });
});

it("overflows every tab when the first does not fit beside the menu", () => {
  expect(packAgentTabs([100, 100], 120, menu, gap)).toEqual({
    visible: [],
    overflow: [0, 1],
  });
});

it("overflows every tab when the menu budget is negative", () => {
  expect(packAgentTabs([10, 10], 20, menu, gap)).toEqual({
    visible: [],
    overflow: [0, 1],
  });
});
