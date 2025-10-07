# Chat-code-exporter

Exports fenced code blocks from the active chat to files.

## Install & Dev

1. Clone into a fresh folder.
2. Install deps: `npm install`.
3. Start dev mode: `npm run dev`.
4. In LM Studio, open *Plugins* and ensure **Chat-code-exporter** appears. Use the sidebar config to set your target directory and options.

## How it works

- A single command, `export_chat_code`, scans markdown for ```lang fences, maps language→file extension, resolves filenames, then writes files using your overwrite and grouping rules. It returns a result table and a JSON summary string you can copy.

## Testing

Run unit tests: `npm test`.

## Publish / Update

- `lms push` to publish to Hub (or update). To change the public name or publish to an org, edit `manifest.json` fields `name` and `owner` before pushing.

## Config

See `src/config.ts` for the sidebar layout and defaults. Fields include: targetDirectory, overwrite_mode, grouping_rule, file_naming_scheme, default_extension, max_files, max_bytes_per_file, dry_run, add_header.