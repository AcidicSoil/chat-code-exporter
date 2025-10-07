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