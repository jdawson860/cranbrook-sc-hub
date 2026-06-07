# Bulk Insert Sessions

Inserts SessionLog records from a JSON file in batches of 500.

**Arguments:**
- `data_file` (optional): Path to JSON file containing SessionLog records. Default: `/tmp/remaining_clean.json`

**Returns:**
- JSON object with `{ ok: boolean, inserted: number, errors: number }`

**Example:**
```bash
deno run -A run.ts /tmp/remaining_clean.json
```
