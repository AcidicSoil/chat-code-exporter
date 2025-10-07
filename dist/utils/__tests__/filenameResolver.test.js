import { describe, it, expect } from "vitest";
import { buildFilename, sanitizeBase } from "../codeBlockExporter.js";
describe("filename resolver", () => {
    it("applies placeholders and extension", () => {
        const name = buildFilename("{lang}-{index}", "python", 3, "py");
        expect(name).toBe("python-3.py");
    });
    it("sanitizes illegal characters and caps length", () => {
        const base = sanitizeBase("bad:/name*with?chars<and>spaces | and more", 12);
        expect(base).toBe("bad_namewith");
    });
});
