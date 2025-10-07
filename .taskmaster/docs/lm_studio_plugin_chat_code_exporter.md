# Project tree

```
chat-code-exporter/
  package.json
  tsconfig.json
  lmstudio.plugin.json
  README.md
  src/
    index.ts
    config.ts
    types.ts
    ui/SidebarPanel.tsx
    lib/markdown.ts
    lib/filename.ts
    lib/fs.ts
  tests/
    languageMap.test.ts
    filenameResolver.test.ts
    traversalGuard.test.ts
  samples/
    sampleChat.md
```

# path: package.json

{
  "name": "chat-code-exporter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "LM Studio plugin to export fenced code blocks from the active chat to files.",
  "scripts": {
    "build": "tsc -p .",
    "dev": "tsc -w -p .",
    "lint": "eslint . --ext .ts,.tsx || echo 'eslint not configured'",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["lmstudio", "plugin", "code-export"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "zod": "^3.23.8",
    "marked": "^12.0.2"
  },
  "devDependencies": {
    "@types/node": "^22.7.5",
    "typescript": "^5.6.3",
    "vitest": "^2.1.3"
  }
}

# path: tsconfig.json

{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests", "samples"],
  "exclude": ["dist"]
}

# path: lmstudio.plugin.json

{
  "$schema": "<https://lmstudio.ai/schemas/plugin.schema.json>",
  "name": "{plugin_name}",
  "displayName": "Chat Code Exporter",
  "version": "0.1.0",
  "main": "dist/index.js",
  "author": "",
  "description": "Exports fenced code blocks from the active chat to files.",
  "commands": [{
    "id": "{command_id}",
    "title": "Export code blocks",
    "entry": "dist/index.js"
  }],
  "panels": [
    {
      "id": "sidebar",
      "title": "Code Export",
      "placement": "right",
      "entry": "dist/index.js"
    }
  ],
  "config": {
    "schema": "ExportCodeBlocksConfig"
  }
}

# path: src/types.ts

export type OverwriteMode = "skip" | "prompt" | "overwrite" | "version";
export type GroupingRule = "flat" | "by-language";

export interface ExportResultRow {
  language: string;
  filename: string;
  size: number;
  action: "created" | "skipped" | "overwritten" | "versioned" | "error";
  error?: string;
}

export interface ChatCodeBlock {
  language: string; // e.g., 'ts', 'python'
  code: string;
  index: number; // order of appearance
}

# path: src/config.ts

import { z } from "zod";
import type { GroupingRule, OverwriteMode } from "./types.js";

// {config_schema}
// Inspired by LM Studio Hub examples for Wikipedia and OpenAI-compat endpoint configs. [3] [4]
export const LanguageExtensionMap = {
  ts: ".ts",
  tsx: ".tsx",
  js: ".js",
  jsx: ".jsx",
  json: ".json",
  py: ".py",
  python: ".py",
  sh: ".sh",
  bash: ".sh",
  ps1: ".ps1",
  go: ".go",
  java: ".java",
  c: ".c",
  h: ".h",
  cpp: ".cpp",
  hpp: ".hpp",
  rs: ".rs",
  md: ".md",
  yaml: ".yaml",
  yml: ".yml",
  txt: ".txt"
} as const;

export const ExportCodeBlocksConfig = z
  .object({
    targetDirectory: z
      .string()
      .min(1, "targetDirectory is required")
      .refine((p) => !p.match(/[\0]/), "NUL byte not allowed"),

    overwriteMode: z
      .enum(["skip", "prompt", "overwrite", "version"]) as z.ZodType<OverwriteMode>,

    groupingRule: z
      .enum(["flat", "by-language"]) as z.ZodType<GroupingRule>,

    fileNamingScheme: z
      .string()
      .min(1, "fileNamingScheme is required")
      .regex(/^[a-zA-Z0-9_\-{}\.]+$/, "Only alnum, _ - . and {tokens}"),

    defaultExtension: z
      .string()
      .regex(/^\.[a-z0-9]{1,8}$/i, "defaultExtension must start with . and be 1-8 letters"),

    maxFiles: z
      .number()
      .int()
      .positive()
      .max(10000, "maxFiles too large"),

    maxBytesPerFile: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024, "maxBytesPerFile too large"),

    dryRun: z.boolean(),
    addHeader: z.boolean()
  })
  .strict();

export type ExportCodeBlocksConfig = z.infer<typeof ExportCodeBlocksConfig>;

export const defaultConfig: ExportCodeBlocksConfig = {
  targetDirectory: ".",
  overwriteMode: "skip",
  groupingRule: "flat",
  fileNamingScheme: "block-{index}",
  defaultExtension: ".txt",
  maxFiles: 500,
  maxBytesPerFile: 1024 *1024* 2,
  dryRun: true,
  addHeader: true
};

# path: src/lib/filename.ts

import type { ExportCodeBlocksConfig } from "../config.js";

const ILLEGAL = /[\\/:*?"<>|]/g; // Windows unsafe
const CONTROL = /[\x00-\x1F\x7F]/g;
const DOTS = /\.+$/; // trailing dots
const MAX_BASENAME = 120; // conservative cap

export function sanitizeBasename(name: string): string {
  let s = name.replace(ILLEGAL, "-").replace(CONTROL, "").trim();
  if (!s) s = "file";
  s = s.replace(DOTS, "");
  if (s.length > MAX_BASENAME) s = s.slice(0, MAX_BASENAME);
  return s;
}

export function resolveFilename(idx: number, language: string, cfg: ExportCodeBlocksConfig): string {
  const base = cfg.fileNamingScheme.replaceAll("{index}", String(idx)).replaceAll("{lang}", language);
  const sanitized = sanitizeBasename(base);
  return sanitized;
}

export function ensureExtension(filename: string, extension: string): string {
  if (!extension.startsWith(".")) extension = "." + extension;
  if (filename.toLowerCase().endsWith(extension.toLowerCase())) return filename;
  return filename + extension;
}

# path: src/lib/markdown.ts

import { marked } from "marked";
import type { ChatCodeBlock } from "../types.js";

export function extractFencedCodeBlocks(markdown: string): ChatCodeBlock[] {
  const tokens = marked.lexer(markdown);
  const blocks: ChatCodeBlock[] = [];
  let index = 0;
  for (const t of tokens) {
    if (t.type === "code" && typeof t.text === "string") {
      const lang = typeof (t as any).lang === "string" && (t as any).lang ? (t as any).lang : "";
      blocks.push({ language: lang.toLowerCase(), code: t.text, index });
      index++;
    }
  }
  return blocks;
}

# path: src/lib/fs.ts

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ExportCodeBlocksConfig } from "../config.js";
import { LanguageExtensionMap } from "../config.js";
import type { ExportResultRow } from "../types.js";
import { ensureExtension, resolveFilename } from "./filename.js";

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function extForLanguage(lang: string, defExt: string): string {
  const key = lang.toLowerCase();
  const m = [LanguageExtensionMap as any](key);
  return m ?? defExt;
}

async function writeAtomic(filePath: string, data: Uint8Array | string) {
  const dir = dirname(filePath);
  const tmp = join(dir, ".~" + Math.random().toString(36).slice(2) + ".tmp");
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}

export async function exportBlocks(markdown: string, cfg: ExportCodeBlocksConfig): Promise<{ rows: ExportResultRow[]; json: string; }>{
  const rows: ExportResultRow[] = [];

  const root = resolve(cfg.targetDirectory);
  const blocks = (await import("./markdown.js")).extractFencedCodeBlocks(markdown);

  if (blocks.length === 0) {
    return { rows: [], json: JSON.stringify({ count: 0, rows: [] }) };
  }

  let written = 0;

  for (const b of blocks) {
    if (written >= cfg.maxFiles) {
      rows.push({ language: b.language || "", filename: "", size: 0, action: "error", error: "maxFiles exceeded" });
      continue;
    }

    const ext = extForLanguage(b.language || "", cfg.defaultExtension);
    let filename = resolveFilename(b.index, b.language || "txt", cfg);
    filename = ensureExtension(filename, ext);

    const subdir = cfg.groupingRule === "by-language" ? b.language || "unknown" : "";
    const dir = subdir ? join(root, subdir) : root;

    // traversal guard: ensure final path is within root
    const finalPath = resolve(dir, filename);
    if (!finalPath.startsWith(root + "")) {
      rows.push({ language: b.language, filename, size: 0, action: "error", error: "Path traversal detected" });
      continue;
    }

    const data = cfg.addHeader
      ? `// language: ${b.language || "unknown"}\n// index: ${b.index}\n\n${b.code}`
      : b.code;

    const size = Buffer.byteLength(data);
    if (size > cfg.maxBytesPerFile) {
      rows.push({ language: b.language, filename, size, action: "error", error: "maxBytesPerFile exceeded" });
      continue;
    }

    if (cfg.dryRun) {
      rows.push({ language: b.language, filename: join(subdir || "", filename), size, action: "created" });
      written++;
      continue;
    }

    await fs.mkdir(dir, { recursive: true });
    const exists = await pathExists(finalPath);

    let action: ExportResultRow["action"] = "created";
    let targetPath = finalPath;

    if (exists) {
      if (cfg.overwriteMode === "skip") {
        rows.push({ language: b.language, filename: join(subdir || "", filename), size, action: "skipped" });
        continue;
      }
      if (cfg.overwriteMode === "version") {
        let n = 1;
        const base = finalPath.replace(/(\.[^./\\]+)$/i, "");
        const extm = finalPath.match(/(\.[^./\\]+)$/i)?.[1] ?? "";
        while (await pathExists(`${base}.${n}${extm}`)) n++;
        targetPath = `${base}.${n}${extm}`;
        action = "versioned";
      }
      if (cfg.overwriteMode === "overwrite") {
        action = "overwritten";
      }
      if (cfg.overwriteMode === "prompt") {
        // UI prompt handled in command; here default to skip for safety
        rows.push({ language: b.language, filename: join(subdir || "", filename), size, action: "skipped" });
        continue;
      }
    }

    await writeAtomic(targetPath, data);
    rows.push({ language: b.language, filename: targetPath.slice(root.length + 1), size, action });
    written++;
  }

  const json = JSON.stringify({ count: rows.length, rows }, null, 2);
  return { rows, json };
}

# path: src/ui/SidebarPanel.tsx

// Minimal UI component powered by LM Studio plugin UI host. API surface per docs. [1]
import type { ExportCodeBlocksConfig } from "../config.js";
import { defaultConfig, ExportCodeBlocksConfig as Schema } from "../config.js";

// Placeholder types for LM Studio UI APIs
// In real runtime, these are provided by LM Studio. [1]
type UIProps = {
  getConfig: () => Promise<unknown>;
  setConfig: (cfg: unknown) => Promise<void>;
  runCommand: (id: string) => Promise<void>;
};

export default function SidebarPanel({ getConfig, setConfig, runCommand }: UIProps) {
  async function onSubmit(ev: any) {
    ev?.preventDefault?.();
    const form = ev.target as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form) as any);
    const candidate: ExportCodeBlocksConfig = {
      targetDirectory: String(data.targetDirectory || defaultConfig.targetDirectory),
      overwriteMode: (data.overwriteMode as any) || defaultConfig.overwriteMode,
      groupingRule: (data.groupingRule as any) || defaultConfig.groupingRule,
      fileNamingScheme: String(data.fileNamingScheme || defaultConfig.fileNamingScheme),
      defaultExtension: String(data.defaultExtension || defaultConfig.defaultExtension),
      maxFiles: Number(data.maxFiles || defaultConfig.maxFiles),
      maxBytesPerFile: Number(data.maxBytesPerFile || defaultConfig.maxBytesPerFile),
      dryRun: Boolean(data.dryRun),
      addHeader: Boolean(data.addHeader)
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      alert(parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n'));
      return;
    }
    await setConfig(parsed.data);
    await runCommand("{command_id}");
  }

  return (
    // Simple, framework-agnostic form. LM Studio injects into a webview. [1]
    // Using bare HTML to avoid external deps.
    // @ts-ignore - JSX runtime provided by host
    <form onSubmit={onSubmit} style={{ padding: 12, fontFamily: 'system-ui' }}>
      <h3>Export code blocks</h3>
      <label>Target directory
        <input name="targetDirectory" placeholder="/c/Users/user/projects/out" style={{ width: '100%' }} />
      </label>
      <label>overwrite_mode
        <select name="overwriteMode" defaultValue="skip">
          <option value="skip">skip</option>
          <option value="prompt">prompt</option>
          <option value="overwrite">overwrite</option>
          <option value="version">version</option>
        </select>
      </label>
      <label>grouping_rule
        <select name="groupingRule" defaultValue="flat">
          <option value="flat">flat</option>
          <option value="by-language">by-language</option>
        </select>
      </label>
      <label>file_naming_scheme
        <input name="fileNamingScheme" defaultValue="block-{index}" />
      </label>
      <label>default_extension
        <input name="defaultExtension" defaultValue=".txt" />
      </label>
      <label>max_files
        <input name="maxFiles" type="number" defaultValue={500} />
      </label>
      <label>max_bytes_per_file
        <input name="maxBytesPerFile" type="number" defaultValue={2097152} />
      </label>
      <label>
        <input name="dryRun" type="checkbox" defaultChecked /> dry_run
      </label>
      <label>
        <input name="addHeader" type="checkbox" defaultChecked /> add_header
      </label>
      <div style={{ marginTop: 12 }}>
        <button type="submit">Run</button>
      </div>
    </form>
  );
}

# path: src/index.ts

// Plugin entry. Registers a command and a sidebar panel. Discovery and lifecycle per docs. [1]
import { defaultConfig, ExportCodeBlocksConfig, ExportCodeBlocksConfig as Schema } from "./config.js";
import { exportBlocks } from "./lib/fs.js";
import SidebarPanel from "./ui/SidebarPanel.js";

// LM Studio runtime host shims. In LM Studio these come from the plugin SDK. [1]
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LM: any = (globalThis as any).LM;

// Command implementation
async function runExport(): Promise<void> {
  // 1) Get current config and active chat markdown from host. [1]
  const cfgRaw = await LM.getConfig();
  const cfg = Schema.parse({ ...defaultConfig, ...(cfgRaw ?? {}) });

  const markdown: string = await LM.getActiveChatMarkdown();

  // 2) Export
  const { rows, json } = await exportBlocks(markdown, cfg);

  // 3) Present results table and copyable JSON. [1]
  await LM.showTable({
    title: "Export results",
    columns: ["language", "filename", "size", "action"],
    rows: rows.map(r => [r.language, r.filename, String(r.size), r.action + (r.error ? `(${r.error})` : "")])
  });
  await LM.showJson({ title: "Summary JSON", json });
}

// Register with LM Studio
export function activate() {
  LM.registerCommand("{command_id}", {
    title: "Export code blocks",
    run: runExport
  });

  LM.registerPanel("sidebar", SidebarPanel);

  // Provide config schema to LM for validation and settings UI. [1] [3] [4]
  LM.provideConfigSchema("ExportCodeBlocksConfig", ExportCodeBlocksConfig);
}

export function deactivate() {
  // no-op
}

# path: tests/languageMap.test.ts

import { describe, it, expect } from "vitest";
import { LanguageExtensionMap } from "../src/config.js";

describe("language→ext map", () => {
  it("covers common languages and defaulting is external", () => {
    expect(LanguageExtensionMap.ts).toBe(".ts");
    expect(LanguageExtensionMap.py).toBe(".py");
    expect(LanguageExtensionMap.js).toBe(".js");
  });
});

# path: tests/filenameResolver.test.ts

import { describe, it, expect } from "vitest";
import { resolveFilename, ensureExtension, sanitizeBasename } from "../src/lib/filename.js";
import { defaultConfig } from "../src/config.js";

describe("filename resolver", () => {
  it("injects index and lang and sanitizes", () => {
    const cfg = { ...defaultConfig, fileNamingScheme: "code-{index}-{lang}" };
    const name = resolveFilename(7, "ts", cfg);
    expect(name).toBe("code-7-ts");
  });
  it("sanitizes illegal characters and caps length", () => {
    const sanitized = sanitizeBasename("a<b>:c*d?e\\f|g\n".repeat(10));
    expect(sanitized.length).toBeLessThanOrEqual(120);
    expect(/[*<>:?"|\\]/.test(sanitized)).toBe(false);
  });
  it("ensures extension when missing", () => {
    expect(ensureExtension("file", ".ts")).toBe("file.ts");
    expect(ensureExtension("file.ts", ".ts")).toBe("file.ts");
  });
});

# path: tests/traversalGuard.test.ts

import { describe, it, expect } from "vitest";
import { exportBlocks } from "../src/lib/fs.js";
import { defaultConfig } from "../src/config.js";

const md = """

```js
console.log('x');
```

""";

describe("traversal guard", () => {
  it("rejects escaping the root via filename", async () => {
    const cfg = { ...defaultConfig, targetDirectory: ".", dryRun: false, fileNamingScheme: "../evil-{index}" };
    const { rows } = await exportBlocks(md, cfg as any);
    expect(rows.some(r => r.action === "error" && r.error?.includes("Path traversal"))).toBe(true);
  });
});

# path: samples/sampleChat.md

Here is a JS and Python example:

```js
console.log('hello');
```

```py
print('hi')
```

# path: README.md

# {plugin_name}: Chat Code Exporter

Single command `{command_id}` that exports fenced code blocks from the active chat to files. Sidebar panel exposes config. [1]

## Setup

- Requirements: Node.js 18+, LM Studio current. [1]
- Clone to a fresh workspace directory.
- Install deps:

```sh
npm ci
npm run build
```

## Scaffold

- LM Studio discovers plugins by manifest `lmstudio.plugin.json` and loads the compiled entry at `main`. [1]
- The config schema key `ExportCodeBlocksConfig` is provided to the host for validation and UI. Inspired by Hub examples. [3] [4]

## Implement

- Command `{command_id}` reads the active chat Markdown, parses fenced blocks, resolves filenames, enforces limits, and writes files with overwrite policy. Shows a result table and a JSON summary for copying. [1]

## Configure

Open the sidebar panel "Code Export". Fields:

- Target directory picker
- overwrite_mode, grouping_rule
- file_naming_scheme, default_extension, max_files, max_bytes_per_file
- Toggles: dry_run, add_header

Validation mirrors Zod schema in `src/config.ts`. Defaults mirror Hub examples style. [3] [4]

## Test

Run unit tests:

```sh
npm test
```

Manual test in LM Studio UI:

1. Build `npm run build`. [1]
2. Load the plugin folder in LM Studio’s Plugins view. Verify command appears as "Export code blocks". [1]
3. Open a chat containing fenced code blocks. Use `samples/sampleChat.md` as content or paste into chat. [1]
4. Open the sidebar panel → set target directory (e.g., `/c/Users/user/tmp/out`). Choose options. Submit. [1]
5. Confirm result table shows language, filename, size, action, and the JSON summary is copyable. Files are written as configured. [1]

## Publish

- Prepare metadata in `lmstudio.plugin.json` and package.json. [2]
- Publish to LM Studio Hub using the documented flow. Include config schema and command entry. [2]
- For updates, bump version and republish; LM Studio fetches the new version per Hub docs. [2]

## Troubleshoot

- Command not visible: check `lmstudio.plugin.json` `main`, `commands[].entry`, build output at `dist/index.js`. [1]
- Config errors: the panel alerts with precise field messages from Zod. Fix values then retry. [3] [4]
- Files not written: confirm permissions to target directory, disable `dry_run`, review overwrite mode. [1]

## Citations

- [1] <https://lmstudio.ai/docs/typescript/plugins>
- [2] <https://lmstudio.ai/docs/typescript/plugins/publish-plugins>
- [3] <https://lmstudio.ai/lmstudio/wikipedia/files/src/configSchematics.ts>
- [4] <https://lmstudio.ai/lmstudio/openai-compat-endpoint/files/src/config.ts>
