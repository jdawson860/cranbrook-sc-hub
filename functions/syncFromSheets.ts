import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SPREADSHEET_ID = '1_6BgfNQzfoxxRwf9oAYkto0FBX8ihUZgDFe3CRE-Xuk';
const SHEET_NAME = 'Session_Data_Responses';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get Google Sheets access token via connector
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Fetch all data from the sheet
    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!sheetsRes.ok) {
      const err = await sheetsRes.text();
      return Response.json({ error: `Sheets API error: ${err}` }, { status: 500 });
    }

    const sheetsData = await sheetsRes.json();
    const rows: string[][] = sheetsData.values || [];

    // Filter to non-empty data rows (skip header row 0)
    const dataRows = rows.slice(1).filter(r => r && r.some(c => c?.trim()));

    if (dataRows.length === 0) {
      return Response.json({ ok: true, synced: 0, skipped: 0, message: 'No data rows found in sheet' });
    }

    // Fetch existing records to deduplicate
    // We'll use a composite key: timestamp+athlete+session+exercise+set+reps+load+rpe
    const existing = await base44.asServiceRole.entities.SessionLog.list();
    const existingKeys = new Set(
      existing.map((r: any) => `${r.timestamp?.slice(0,10)}|${r.athlete}|${r.session_type}|${r.exercise}|${r.set_number}|${r.reps}|${r.load}|${r.rpe}`)
    );

    let synced = 0;
    let skipped = 0;
    let errors = 0;
    const setCounters: Record<string, number> = {};

    for (const row of dataRows) {
      // Columns: Timestamp, Date, Athlete, SessionType, Exercise, Sets, Reps, Load, RPE
      const [timestamp, , athlete, session_type, exercise, , reps, load, rpe] = row;

      if (!athlete || !session_type || !exercise) { skipped++; continue; }

      // Build a set number tracker per athlete+session+exercise within same timestamp date
      const dateKey = (timestamp || '').slice(0, 10);
      const setKey = `${dateKey}|${athlete}|${session_type}|${exercise}`;
      setCounters[setKey] = (setCounters[setKey] || 0) + 1;
      const set_number = setCounters[setKey];

      // Normalise timestamp
      let ts = timestamp?.trim();
      if (!ts) ts = dateKey;
      // Parse M/D/YYYY HH:MM:SS → ISO
      const dtMatch = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)$/);
      if (dtMatch) {
        const [, m, d, y, time] = dtMatch;
        ts = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}${time ? 'T'+time : 'T00:00:00'}`;
      }

      const repsNum = reps ? parseFloat(reps) : null;
      const loadStr = load || null;
      const rpeNum = rpe ? parseFloat(rpe) : null;

      // Dedup check
      const key = `${ts.slice(0,10)}|${athlete}|${session_type}|${exercise}|${set_number}|${repsNum}|${loadStr}|${rpeNum}`;
      if (existingKeys.has(key)) { skipped++; continue; }

      try {
        await base44.asServiceRole.entities.SessionLog.create({
          timestamp: ts,
          athlete: athlete.trim(),
          session_type: session_type.trim(),
          exercise: exercise.trim(),
          set_number,
          reps: repsNum,
          load: loadStr,
          rpe: rpeNum,
        });
        existingKeys.add(key);
        synced++;
      } catch(e) {
        errors++;
      }
    }

    return Response.json({
      ok: true,
      synced,
      skipped,
      errors,
      message: `Synced ${synced} new records, skipped ${skipped} duplicates`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
