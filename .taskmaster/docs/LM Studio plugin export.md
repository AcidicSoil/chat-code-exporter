
Lm Studio Plugin Template: Export Chat Code Blocks

Copy

Edit

Download

Setup
=====

Use Node.js included in LM Studio. Run development via CLI. citeturn10view0

Scaffold
========

Project tree:

{plugin\_name}/

manifest.json

package.json

tsconfig.json

README.md

src/

index.ts

config.ts

toolsProvider.ts

Implement
=========

\# path: src/index.ts

import { type PluginContext } from "@lmstudio/sdk";

import { configSchematics, globalConfigSchematics } from "./config";

import { toolsProvider } from "./toolsProvider";

export async function main(context: PluginContext) {

// Register configuration UIs (local + global).

context.withConfigSchematics(configSchematics); // inspired by openai-compat index.ts

context.withGlobalConfigSchematics(globalConfigSchematics); // inspired by openai-compat index.ts

// Register tools so the command becomes available in chat.

context.withToolsProvider(toolsProvider);

}

\# path: src/config.ts

import { createConfigSchematics } from "@lmstudio/sdk";

// {config\_schema}

// Local (per-chat) config + Global (machine-wide) config.

// Defaults and validation mirror the Hub examples: string fields with displayName, hint/placeholder,

// and a select with predefined options.

export const configSchematics = createConfigSchematics()

.field(

"rootDir",

"string",

{

displayName: "Root Directory",

hint: "Directory where files will be written. Must already exist.",

},

".",

)

.field(

"overwriteBehavior",

"select",

{

displayName: "On Existing Files",

subtitle: "Choose how to handle existing files in the target directory.",

options: \[

{ value: "skip", displayName: "Skip" },

{ value: "overwrite", displayName: "Overwrite" },

{ value: "error", displayName: "Error" },

\],

},

"skip",

)

.build();

export const globalConfigSchematics = createConfigSchematics()

.field(

"exportToken",

"string",

{

displayName: "Export Token",

isProtected: true,

placeholder: "set-any-non-empty-secret",

},

"",

)

.build();

\# path: src/toolsProvider.ts

content: z.string().default(""),

mode: z.enum(\["write", "append"\]).optional(),

}),

)

.min(1, "at least one file"),

},

implementation: async ({ exportToken, files }, { warn }) => {

const configuredToken = gcfg.get("exportToken");

if (!configuredToken) {

return {

error: "Global exportToken not set. Open plugin settings and set a non-empty secret.",

fix: "Set Global → Export Token, then retry.",

};

}

if (configuredToken !== exportToken) {

return { error: "Invalid exportToken", fix: "Pass the same secret you set in Global config." };

}

const rootDir = cfg.get("rootDir");

const behavior = cfg.get("overwriteBehavior") as "skip" | "overwrite" | "error";

if (!rootDir) {

return { error: "rootDir is empty", fix: "Set a valid directory in plugin settings." };

}

// Verify root exists

try {

const stats = await fs.stat(rootDir);

if (!stats.isDirectory()) {

return { error: "rootDir is not a directory", fix: "Point rootDir to an existing folder." };

}

} catch {

return { error: "rootDir does not exist", fix: "Create the folder or change rootDir." };

}

const wrote: string\[\] = \[\];

const skipped: string\[\] = \[\];

const errors: Array<{ path: string; error: string }> = \[\];

for (const f of files) {

const dest = path.resolve(rootDir, f.path);

const rel = path.relative(rootDir, dest);

if (rel.startsWith("..") || path.isAbsolute(rel)) {

errors.push({ path: f.path, error: "path escapes rootDir" });

continue;

}

try {

await fs.mkdir(path.dirname(dest), { recursive: true });

const exists = await fs

.stat(dest)

.then(() => true)

.catch(() => false);

const mode = f.mode ?? "write";

if (exists && behavior === "skip") {

skipped.push(rel);

continue;

}

if (exists && behavior === "error") {

errors.push({ path: rel, error: "already exists" });

continue;

}

if (mode === "append" && exists) {

await fs.appendFile(dest, f.content);

} else {

await fs.writeFile(dest, f.content);

}

wrote.push(rel);

} catch (e: any) {

warn?.(String(e?.message ?? e));

errors.push({ path: f.path, error: String(e?.message ?? e) });

}

}

return { rootDir, wrote, skipped, errors };

},

});

return \[command\];

}

Configure
=========

\# path: manifest.json

{

"type": "plugin",

"runner": "node",

"owner": "your-hub-username-or-org",

"name": "{plugin\_name}"

}

\# path: package.json

{

"name": "lms-plugin-{plugin\_name}",

"version": "0.1.0",

"main": "dist/index.js",

"scripts": {

"dev": "lms dev",

"push": "lms push",

"build": "tsc -p ."

},

"dependencies": {

"@lmstudio/sdk": "1.4.0",

"zod": "3.24.1"

},

"devDependencies": {

"@types/node": "^20.14.8",

"typescript": "^5.6.0"

}

}

\# path: tsconfig.json

{

"compilerOptions": {

"strict": true,

"module": "CommonJS",

"target": "ES2021",

"declaration": true,

"noImplicitOverride": true,

"sourceMap": true,

"declarationMap": true,

"esModuleInterop": true,

"skipLibCheck": true,

"rootDir": "src",

"outDir": "dist"

},

"include": \["src"\]

}

\# path: README.md

\# {plugin\_name}

One command: \`{command\_id}\`. It writes chat code blocks to files under a configured root.

\## Configure

\- Local config: \`rootDir\` and \`overwriteBehavior\`.

\- Global config: \`exportToken\` secret.

\## Use

1\. Start dev: \`lms dev\` in this folder.

2\. In LM Studio, open a chat.

3\. Ask the model to export code blocks and include the token, for example:

"Export the last code blocks using \`{command\_id}\` with files: ... and exportToken: ..."

4\. The tool returns a JSON summary: \`wrote\`, \`skipped\`, \`errors\`.

\## Notes

\- Paths are sandboxed to \`rootDir\`.

\- Existing files follow \`overwriteBehavior\`.

\- Use \`mode: "append"\` to append.

Test
====

* Run `lms dev`. The plugin appears in the plugin list. Open a chat and trigger `{command_id}` by asking the model to call it with the files it extracted. The command should execute and report results.

Publish
=======

* Build and push: `npm run build && lms push`.

* To publish under an org, set `owner` in `manifest.json` then run `lms push --private` if needed.

Troubleshoot
============

* Error: `rootDir does not exist` → create the folder or point to another directory.

* Error: `path escapes rootDir` → use relative paths inside the workspace.

* Error: `Invalid exportToken` → pass the same secret configured in Global settings.

* Existing files unexpectedly overwritten → set `overwriteBehavior` to `skip` or `error`.

Thought for 7s

You’ll get a working LM Studio plugin template named `{plugin_name}` with one command `{command_id}` that writes chat code blocks to a target directory. I put the full repo in the canvas.

Setup
=====

* Use LM Studio’s built-in Node runtime. Develop with `lms dev`; the plugin appears in the plugin list and auto-reloads. [LM Studio](https://lmstudio.ai/docs/typescript/plugins)

Scaffold
========

* Files are in the canvas. They include `manifest.json`, `package.json`, `tsconfig.json`, `src/index.ts`, `src/config.ts`, `src/toolsProvider.ts`, and `README.md`. Code follows the SDK examples and LM Studio’s dev flow. [LM Studio](https://lmstudio.ai/docs/typescript/plugins)

Implement
=========

* Entry registers local and global config schematics, then a tools provider. Pattern mirrors the Hub “openai-compat-endpoint” entry for registering schematics. [LM Studio](https://lmstudio.ai/lmstudio/openai-compat-endpoint/files/src/index.ts)

* `{command_id}` parameters: `{ exportToken, files: [{ path, content, mode? }] }`. It enforces a root sandbox, mkdirs, and honors overwrite behavior. Config drives `rootDir` and `overwriteBehavior`. See canvas `src/toolsProvider.ts`. (General plugin behavior and dev flow) [LM Studio](https://lmstudio.ai/docs/typescript/plugins)

Configure
=========

* `{config_schema}` is implemented with `createConfigSchematics()`:

  * Local config:

    * `rootDir: string` with `displayName` and `hint`, default `"."` (pattern from Wikipedia config). [LM Studio](https://lmstudio.ai/lmstudio/wikipedia/files/src/configSchematics.ts)

    * `overwriteBehavior: select` with options `skip|overwrite|error` and default `skip` (pattern from OpenAI-compat select field). [LM Studio](https://lmstudio.ai/lmstudio/openai-compat-endpoint/files/src/config.ts)

  * Global config:

    * `exportToken: string` with `isProtected: true` and `placeholder` (pattern from OpenAI-compat protected fields). [LM Studio](https://lmstudio.ai/lmstudio/openai-compat-endpoint/files/src/config.ts)

Test
====

* In a fresh workspace:

    1. `npm run dev` to start `lms dev`. The plugin shows in the UI plugin list. [LM Studio](https://lmstudio.ai/docs/typescript/plugins)

    2. Open the plugin settings. Set **Global → Export Token** and **Local → Root Directory**. (Config UI comes from schematics.) [LM Studio+1](https://lmstudio.ai/lmstudio/openai-compat-endpoint/files/src/config.ts)

    3. In a chat, ask the model to call `{command_id}` with the code blocks it just produced and include `exportToken`. Command will execute and return `{ wrote, skipped, errors }`. (Plugins run automatically once installed and visible in chats.) [LM Studio](https://lmstudio.ai/docs/typescript/plugins)

Publish
=======

* Build and push to Hub: `npm run build && lms push`. [LM Studio](https://lmstudio.ai/docs/typescript/plugins/publish-plugins)

* Rename plugin: edit `manifest.json:name` (kebab-case) before pushing. [LM Studio](https://lmstudio.ai/docs/typescript/plugins/publish-plugins)

* Publish to an org: set `manifest.json:owner` to the org, then `lms push` (or `--private` if supported). [LM Studio](https://lmstudio.ai/docs/typescript/plugins/publish-plugins)

* LM Studio discovers and runs installed plugins automatically; dev mode shows them live in the list. [LM Studio](https://lmstudio.ai/docs/typescript/plugins)

Troubleshoot
============

* “rootDir does not exist” → create the folder or change the setting. (String field with default from schematics.) [LM Studio](https://lmstudio.ai/lmstudio/wikipedia/files/src/configSchematics.ts)

* “Invalid exportToken” → set protected Global `exportToken` and pass the same value in the command. (Protected field pattern.) [LM Studio](https://lmstudio.ai/lmstudio/openai-compat-endpoint/files/src/config.ts)

* Overwrites unexpected → set `overwriteBehavior` to `skip` or `error`. (Select field pattern with default.) [LM Studio](https://lmstudio.ai/lmstudio/openai-compat-endpoint/files/src/config.ts)

Notes

* The repo’s `package.json` and `tsconfig.json` mirror the Hub example patterns, including `scripts` (`lms dev`, `lms push`) and TS targets. [LM Studio+1](https://lmstudio.ai/lmstudio/wikipedia/files/package.json)

* The `manifest.json` structure uses `type`, `runner`, `owner`, `name` per publishing docs; adjust `owner/name` before pushing. [LM Studio](https://lmstudio.ai/docs/typescript/plugins/publish-plugins)

If you want me to swap `{plugin_name}` and `{command_id}` for concrete values, say the names and I’ll update the canvas.

---
