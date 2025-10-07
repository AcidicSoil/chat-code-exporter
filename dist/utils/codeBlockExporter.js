import fs from "node:fs";
import path from "node:path";
export const EXT_MAP = {
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
const ILLEGAL = /[\0\n\r\t\\/:*?"<>|]/g; // Windows‑safe
export function parseFencedBlocks(markdown) {
    const blocks = [];
    const fence = /```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g; // non‑greedy between fences
    let m;
    while ((m = fence.exec(markdown))) {
        const lang = (m[1] || "").trim().toLowerCase();
        const code = m[2];
        blocks.push({ lang, code });
    }
    return blocks;
}
export function sanitizeBase(base, cap = 80) {
    const clean = base.replace(ILLEGAL, "_").replace(/\s+/g, "-");
    return clean.slice(0, cap) || "snippet";
}
export function resolveExt(lang, fallback) {
    return EXT_MAP[lang] || fallback;
}
export function buildFilename(template, lang, index, ext) {
    const base = template
        .replaceAll("{lang}", lang || "plain")
        .replaceAll("{index}", String(index));
    const sanitized = sanitizeBase(base);
    return `${sanitized}.${ext}`;
}
function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}
function versionPath(p) {
    if (!fs.existsSync(p))
        return p;
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
export function preventTraversal(root, candidate) {
    const rel = path.relative(root, candidate);
    return rel.startsWith("..") || path.isAbsolute(rel);
}
export function exportBlocks(markdown, cfg, promptOverwrite) {
    const rows = [];
    const blocks = parseFencedBlocks(markdown);
    const maxFiles = Math.max(0, Number(cfg.max_files || 0));
    const capBytes = Math.max(1, Number(cfg.max_bytes_per_file || 1));
    const dryRun = cfg.dry_run === "true";
    const addHeader = cfg.add_header === "true";
    const root = path.resolve(cfg.targetDirectory);
    if (!dryRun)
        ensureDir(root);
    let written = 0;
    blocks.forEach((b, i) => {
        if (maxFiles && written >= maxFiles)
            return;
        const ext = resolveExt(b.lang, cfg.default_extension);
        const fname = buildFilename(cfg.file_naming_scheme, b.lang || "plain", i + 1, ext);
        const subdir = cfg.grouping_rule === "by-language" ? path.join(root, b.lang || "plain") : root;
        const full = path.join(subdir, fname);
        const actionRow = { language: b.lang || "", filename: full, size: Buffer.byteLength(b.code), action: "created" };
        if (actionRow.size > capBytes) {
            actionRow.action = "error";
            actionRow.error = `exceeds max_bytes_per_file (${capBytes})`;
            rows.push(actionRow);
            return;
        }
        if (!dryRun)
            ensureDir(subdir);
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
        if (!dryRun)
            fs.writeFileSync(actionRow.filename, header + b.code, { encoding: "utf8" });
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
