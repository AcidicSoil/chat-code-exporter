import { defineToolsProviderPlugin } from "@lmstudio/sdk";
import { configSchematics, globalConfigSchematics } from "./config.js";
import { exportBlocks } from "./utils/codeBlockExporter.js";
export default defineToolsProviderPlugin({
    manifestVersion: 1,
    name: "Chat-code-exporter",
    configSchematics,
    globalConfigSchematics,
    tools: [
        {
            id: "export_chat_code",
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
                const markdown = input?.markdown || context?.chatMarkdown || "";
                if (!markdown) {
                    return {
                        message: "No markdown provided or available from context.",
                        rows: [],
                        summary: { total_blocks: 0 }
                    };
                }
                const { rows, summary } = exportBlocks(markdown, config, (p) => {
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
