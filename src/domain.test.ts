import { describe, expect, it } from "vitest";
import {
  countWords,
  orderedNodes,
  progress,
  sessionDelta,
  type ManuscriptNode,
} from "./domain";

describe("word count", () => {
  it("counts prose across punctuation and Unicode", () =>
    expect(countWords("Léa’s book — déjà vu. Page 43")).toBe(6));
  it("handles blank text", () => expect(countWords("  \n ")).toBe(0));
});
describe("writing statistics", () => {
  it("never reports deletion as words written", () =>
    expect(sessionDelta(100, 80)).toBe(0));
  it("caps progress at 100", () => expect(progress(600, 500)).toBe(100));
});
describe("manuscript ordering", () => {
  it("sorts nodes by explicit order", () => {
    const base = {
      projectId: "p",
      type: "scene",
      title: "",
      createdAt: "2020",
      updatedAt: "2020",
      syncStatus: "pending",
    } as const;
    const nodes = [
      { ...base, id: "b", order: 2 },
      { ...base, id: "a", order: 1 },
    ] as ManuscriptNode[];
    expect(orderedNodes(nodes).map((n) => n.id)).toEqual(["a", "b"]);
  });
});
