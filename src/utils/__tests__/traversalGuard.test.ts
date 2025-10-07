import { describe, it, expect } from "vitest";
import { preventTraversal } from "../codeBlockExporter.js";
import path from "node:path";

describe("traversal guard", () => {
  it("blocks paths that escape root", () => {
    const root = "/tmp/root";
    const bad = path.join(root, "..", "evil.txt");
    expect(preventTraversal(root, bad)).toBe(true);
  });

  it("allows paths within root", () => {
    const root = "/tmp/root";
    const ok = path.join(root, "a", "b.txt");
    expect(preventTraversal(root, ok)).toBe(false);
  });
});