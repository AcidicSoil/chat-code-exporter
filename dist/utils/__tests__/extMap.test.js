import { describe, it, expect } from "vitest";
import { resolveExt, EXT_MAP } from "../codeBlockExporter.js";
describe("language→ext map", () => {
    it("maps known aliases and falls back", () => {
        expect(resolveExt("javascript", "txt")).toBe("js");
        expect(resolveExt("js", "txt")).toBe("js");
        expect(resolveExt("python", "txt")).toBe("py");
        expect(resolveExt("unknownlang", "txt")).toBe("txt");
    });
    it("contains some common languages", () => {
        ["js", "ts", "py", "sh", "json", "yaml", "md", "html", "css"].forEach(k => {
            expect(EXT_MAP[k]).toBeTruthy();
        });
    });
});
