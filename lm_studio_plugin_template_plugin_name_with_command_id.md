```
# tree
.
├─ manifest.json
├─ package.json
├─ tsconfig.json
├─ README.md
└─ src/
   ├─ index.ts
   ├─ config.ts
   └─ utils/
      ├─ codeBlockExporter.ts
      └─ __tests__/
         ├─ extMap.test.ts
         ├─ filenameResolver.test.ts
         └─ traversalGuard.test.ts
```

```ts
# path: manifest.json
{
  "name": "{plugin_name}",
  "owner": "your-hub-handle-or-org",
  "version": "0.1.0",
  "description": "Exports fenced code blocks from the active chat to files.",
  "keywords": ["lmstudio", "plugin", "export", "code"],
  "icon": "",
  "entry": "dist/index.js"
}
```

```json
# path: package.json
{
  "name": "{plugin_name}",
  "version": "0.1.0",
  "description": "Exports fenced code blocks from the active chat to files.",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p .",
    "dev": "lms dev",
    "test": "vitest run --reporter=dot",
    "lint": "eslint --ext .ts src",
    "prepare": "npm run build"
  },
  "dependencies": {
    "@lmstudio/sdk": "^0.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "typescript": "^5.6.3",
    "vitest": "^2.0.5",
    "eslint": "^9.11.1",
    "@eslint/js": "^9.11.1",
    "typescript-eslint": "^8.8.1"
  }
}
```

```json
# path: tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

```ts
# path: src/config.ts
import { createConfigSchematics } from "@lmstudio/sdk";

// Local (per-plugin-instance) configuration shown in the sidebar UI.
export const configSchematics = createConfigSchematics()
  .field(
    "targetDirectory",
    "string",
    {
      displayName: "Target Directory",
      hint: "Absolute or workspace‑relative path where files will be written.",
      placeholder: "/c/Users/user/Downloads/code-exports"
    },
    "./code-exports"
  )
  .field(
    "overwrite_mode",
    "select",
    {
      displayName: "Overwrite Mode",
      subtitle: "How to handle existing files",
      options: [
        { value: "skip", displayName: "skip" },
        { value: "prompt", displayName: "prompt" },
        { value: "overwrite", displayName: "overwrite" },
        { value: "version", displayName: "version" }
      ]
    },
    "version"
  )
  .field(
    "grouping_rule",
    "select",
    {
      displayName: "Grouping Rule",
      subtitle: "Write into subfolders by language or all in root",
      options: [
        { value: "flat", displayName: "flat" },
        { value: "by-language", displayName: "by-language" }
      ]
    },
    "by-language"
  )
  .field(
    "file_naming_scheme",
    "string",
    {
      displayName: "File Naming Scheme",
      hint: "Use {lang} and {index} placeholders, e.g. snippet-{index}.{ext}",
      placeholder: "{lang}-{index}"
    },
    "snippet-{index}"
  )
  .field(
    "default_extension",
    "string",
    {
      displayName: "Default Extension",
      hint: "Used when the code fence language isn’t recognized. No leading dot.",
      placeholder: "txt"
    },
    "txt"
  )
  .field(
    "max_files",
    "string",
    {
      displayName: "Max Files",
      hint: "Soft limit; additional files are ignored.",
      placeholder: "100"
    },
    "100"
  )
  .field(
    "max_bytes_per_file",
    "string",
    {
      displayName: "Max Bytes per File",
      hint: "Hard cap per file to prevent huge writes.",
      placeholder: "1048576"
    },
    "1048576"
  )
  .field(
    "dry_run",
    "select",
    {
      displayName: "Dry Run",
      subtitle: "Simulate without writing"
    },
    "false"
  )
  .field(
    "add_header",
    "select",
    {
      displayName: "Add Header",
      subtitle: "Prepend a comment header with source metadata"
    },
    "true"
  )
  .build();

// Global (user‑scoped) configuration, if needed later. Keeping it empty for now.
export const globalConfigSchematics = createConfigSchematics().build();
```

```ts
# path: src/utils/codeBlockExporter.ts
import fs from "node:fs";
import path from "node:path";

export type OverwriteMode = "skip" | "prompt" | "overwrite" | "version";
export type GroupingRule = "flat" | "by-language";

export const EXT_MAP: Record<string, string> = {
  js: "js",
  javascript: "js",
  ts: "ts",
  typescript: "ts",
  py: "py",
  python: "py",
  sh: "sh",
  bash: "sh",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "md",
  markdown: "md",
  html: "html",
  css: "css",
  cpp: "cpp",
  c: "c",
  java: "java",
  go: "go",
};

export interface ExportConfig {
  targetDirectory: string;
  overwrite_mode: OverwriteMode;
  grouping_rule: GroupingRule;
  file_naming_scheme: string; // e.g. "snippet-{index}"
  default_extension: string; // without dot
  max_files: string; // numeric string per config UI
  max_bytes_per_file: string; // numeric string per config UI
  dry_run: string; // "true" | "false" from select
  add_header: string; // "true" | "false"
}

export interface ResultRow {
  language: string;
  filename: string;
  size: number;
  action: "created" | "skipped" | "overwritten" | "versioned" | "prompted" | "error";
  error?: string;
}

const ILLEGAL = /[\0\n\r\t\\/:*?"<>|]/g; // Windows‑safe

export function parseFencedBlocks(markdown: string): Array<{ lang: string; code: string }>{
  const blocks: Array<{ lang: string; code: string }> = [];
  const fence = /```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g; // non‑greedy between fences
  let m: RegExpExecArray | null;
  while ((m = fence.exec(markdown))) {
    const lang = (m[1] || "").trim().toLowerCase();
    const code = m[2];
    blocks.push({ lang, code });
  }
  return blocks;
}

export function sanitizeBase(base: string, cap = 80): string {
  const clean = base.replace(ILLEGAL, "_").replace(/\s+/g, "-");
  return clean.slice(0, cap) || "snippet";
}

export function resolveExt(lang: string, fallback: string): string {
  return EXT_MAP[lang] || fallback;
}

export function buildFilename(template: string, lang: string, index: number, ext: string): string {
  const base = template
    .replaceAll("{lang}", lang || "plain")
    .replaceAll("{index}", String(index));
  const sanitized = sanitizeBase(base);
  return `${sanitized}.${ext}`;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function versionPath(p: string): string {
  if (!fs.existsSync(p)) return p;
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const name = path.basename(p, ext);
  let i = 2;
  let next = path.join(dir, `${name}.${i}${ext}`);
  while (fs.existsSync(next)) {
    i += 1;
    next = path.join(dir, `${name}.${i}${ext}`);
  }
  return next;
}

export function preventTraversal(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel.startsWith("..") || path.isAbsolute(rel);
}

export function exportBlocks(
  markdown: string,
  cfg: ExportConfig,
  promptOverwrite?: (fullPath: string) => boolean,
): { rows: ResultRow[]; summary: Record<string, unknown> } {
  const rows: ResultRow[] = [];
  const blocks = parseFencedBlocks(markdown);

  const maxFiles = Math.max(0, Number(cfg.max_files || 0));
  const capBytes = Math.max(1, Number(cfg.max_bytes_per_file || 1));
  const dryRun = cfg.dry_run === "true";
  const addHeader = cfg.add_header === "true";

  const root = path.resolve(cfg.targetDirectory);
  if (!dryRun) ensureDir(root);

  let written = 0;
  blocks.forEach((b, i) => {
    if (maxFiles && written >= maxFiles) return;

    const ext = resolveExt(b.lang, cfg.default_extension);
    const fname = buildFilename(cfg.file_naming_scheme, b.lang || "plain", i + 1, ext);

    const subdir = cfg.grouping_rule === "by-language" ? path.join(root, b.lang || "plain") : root;
    const full = path.join(subdir, fname);

    const actionRow: ResultRow = { language: b.lang || "", filename: full, size: Buffer.byteLength(b.code), action: "created" };

    if (actionRow.size > capBytes) {
      actionRow.action = "error";
      actionRow.error = `exceeds max_bytes_per_file (${capBytes})`;
      rows.push(actionRow);
      return;
    }

    if (!dryRun) ensureDir(subdir);

    if (preventTraversal(root, full)) {
      actionRow.action = "error";
      actionRow.error = "path traversal blocked";
      rows.push(actionRow);
      return;
    }

    if (fs.existsSync(full)) {
      if (cfg.overwrite_mode === "skip") {
        actionRow.action = "skipped";
        rows.push(actionRow);
        return;
      }
      if (cfg.overwrite_mode === "prompt") {
        const yes = promptOverwrite ? promptOverwrite(full) : false;
        if (!yes) {
          actionRow.action = "prompted";
          rows.push(actionRow);
          return;
        }
      }
      if (cfg.overwrite_mode === "version") {
        const v = versionPath(full);
        actionRow.filename = v;
      }
      // overwrite mode falls through to write
      actionRow.action = cfg.overwrite_mode === "overwrite" ? "overwritten" : actionRow.action;
    }

    const header = addHeader ? `# path: ${path.basename(actionRow.filename)}\n` : "";
    if (!dryRun) fs.writeFileSync(actionRow.filename, header + b.code, { encoding: "utf8" });
    rows.push(actionRow);
    written += 1;
  });

  const summary = {
    total_blocks: blocks.length,
    attempted: Math.min(blocks.length, maxFiles || blocks.length),
    written: rows.filter(r => ["created", "overwritten", "versioned"].includes(r.action)).length,
    skipped: rows.filter(r => r.action === "skipped").length,
    errors: rows.filter(r => r.action === "error").length,
  };
  return { rows, summary };
}
```

```ts
# path: src/index.ts
import { defineToolsProviderPlugin } from "@lmstudio/sdk";
import { configSchematics, globalConfigSchematics } from "./config.js";
import { exportBlocks, type ExportConfig } from "./utils/codeBlockExporter.js";

export default defineToolsProviderPlugin({
  manifestVersion: 1,
  name: "{plugin_name}",
  configSchematics,
  globalConfigSchematics,
  tools: [
    {
      id: "{command_id}",
      displayName: "Export fenced code blocks",
      description: "Parse the current chat markdown and write code blocks to files.",
      // Minimal args; if LM Studio passes the active chat markdown, we read from context.
      // Otherwise, the user can paste markdown into the single input.
      input: {
        type: "object",
        properties: {
          markdown: { type: "string", description: "Optional override markdown. If empty, use active chat." }
        },
        required: []
      },
      execute: async ({ input, context, config }) => {
        // Prefer markdown sent in input; otherwise use chat transcript if available in context.
        const markdown: string = (input as any)?.markdown || (context as any)?.chatMarkdown || "";
        if (!markdown) {
          return {
            message: "No markdown provided or available from context.",
            rows: [],
            summary: { total_blocks: 0 }
          };
        }
        const { rows, summary } = exportBlocks(markdown, config as ExportConfig, (p) => {
          // LM Studio can render a modal in future; for now default deny.
          return false;
        });
        return {
          message: "Export completed",
          rows,
          summary,
        };
      }
    }
  ]
});
```

```ts
# path: src/utils/__tests__/extMap.test.ts
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
    ["js","ts","py","sh","json","yaml","md","html","css"].forEach(k => {
      expect(EXT_MAP[k]).toBeTruthy();
    });
  });
});
```

```ts
# path: src/utils/__tests__/filenameResolver.test.ts
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
```

```ts
# path: src/utils/__tests__/traversalGuard.test.ts
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
```

```md
# path: README.md
# {plugin_name}

Exports fenced code blocks from the active chat to files.

## Install & Dev

1. Clone into a fresh folder.
2. Install deps: `npm install`.
3. Start dev mode: `npm run dev`.
4. In LM Studio, open *Plugins* and ensure **{plugin_name}** appears. Use the sidebar config to set your target directory and options.

## How it works

- A single command, `{command_id}`, scans markdown for ```lang fences, maps language→file extension, resolves filenames, then writes files using your overwrite and grouping rules. It returns a result table and a JSON summary string you can copy.

## Testing

Run unit tests: `npm test`.

## Publish / Update

- `lms push` to publish to Hub (or update). To change the public name or publish to an org, edit `manifest.json` fields `name` and `owner` before pushing.

## Config

See `src/config.ts` for the sidebar layout and defaults. Fields include: targetDirectory, overwrite_mode, grouping_rule, file_naming_scheme, default_extension, max_files, max_bytes_per_file, dry_run, add_header.

```

