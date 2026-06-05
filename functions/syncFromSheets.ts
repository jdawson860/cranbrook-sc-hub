import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID = "1_6BgfNQzfoxxRwf9oAYkto0FBX8ihUZgDFe3CRE-Xuk";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

async function getSheetRows(token: string, sheetName: string, maxRows = 500): Promise<string[][]> {
  const url = `${SHEETS_API}/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:J${maxRows}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await resp.json();
  return data.values || [];
}

function sheetsDateToISO(val: string): string {
  // Handle Google Sheets serial number (e.g. 46177 = 2026-06-04)
  const serial = parseFloat(val);
  if (!isNaN(serial) && serial > 40000) {
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + serial * 86400000);
    return date.toISOString().split('T')[0];
  }
  // Handle M/D/YYYY or M/D/YYYY H:MM:SS
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}
  return val;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    // Get token from env or request body
    const body = await req.json().catch(() => ({}));
    let token = body.sheets_token || Deno.env.get("GOOGLESHEETS_ACCESS_TOKEN");

    // If no token in env, we're in a webhook context — this sync will need to be called
    // by an agent with the token available
    if (!token) {
      return Response.json({
        error: "No Google Sheets token available",
        note: "This function should be called by the Bruce agent with a fresh token"
      }, { status: 400 });
    }

    const athletes = ['AF', 'RR', 'JC', 'MA', 'TL', 'CC', 'SK', 'AS', 'AD', 'OO'];
    const results = { session_records: 0, testing_records: 0, errors: [] as string[] };

    // ── 1. SYNC SESSION DATA from individual athlete tabs ────────────────────
    const newSessionRecords: any[] = [];

    for (const ath of athletes) {
      try {
        const rows = await getSheetRows(token, `Athlete_${ath}`, 500);
        if (rows.length < 2) continue;
        // headers: Date, Session, Exercise, Sets, Reps, Load, RPE, Volume
        for (const row of rows.slice(1)) {
          if (!row[0] || !row[1] || !row[2]) continue;
          const dateStr = sheetsDateToISO(row[0]);
          newSessionRecords.push({
            timestamp: `${dateStr}T09:00:00`,
            athlete: ath,
            session_type: row[1] || '',
            exercise: row[2] || '',
            set_number: parseInt(row[3]) || 1,
            reps: row[4] || '',
            load: row[5] || '',
            rpe: row[6] ? parseInt(row[6]) : null,
          });
        }
      } catch (e: any) {
        results.errors.push(`Athlete_${ath}: ${e.message}`);
      }
    }

    // Clear existing and reload (full refresh strategy)
    if (newSessionRecords.length > 0) {
      const existing = await db.SessionLog.list();
      for (const rec of existing) {
        await db.SessionLog.delete(rec.id);
      }
      for (const rec of newSessionRecords) {
        await db.SessionLog.create(rec);
      }
      results.session_records = newSessionRecords.length;
    }

    // ── 2. SYNC TESTING DATA from Core_Testing_Responses ────────────────────
    const testRows = await getSheetRows(token, 'Core_Testing_Responses', 500);
    const newTestRecords: any[] = [];

    for (const row of testRows.slice(1)) {
      if (row.length < 10) continue;
      const firstName = (row[1] || '').trim().toUpperCase();
      const lastName = (row[2] || '').trim().toUpperCase();
      // Skip test/empty rows
      if (!firstName || firstName === 'TEST' || firstName === 'NOTREAL') continue;

      let ts = row[0];
      try { ts = new Date(row[0]).toISOString(); } catch {}

      newTestRecords.push({
        timestamp: ts,
        athlete_first: row[1].trim(),
        athlete_last: row[2].trim(),
        athlete_name: `${row[1].trim()} ${row[2].trim()}`,
        year_level: row[3] || '',
        height: parseFloat(row[4]) || null,
        weight: parseFloat(row[5]) || null,
        hollow_hold: parseFloat(row[6]) || null,
        prone_plank: parseFloat(row[7]) || null,
        side_plank_left: parseFloat(row[8]) || null,
        side_plank_right: parseFloat(row[9]) || null,
      });
    }

    if (newTestRecords.length > 0) {
      const existing = await db.TestingResult.list();
      for (const rec of existing) {
        await db.TestingResult.delete(rec.id);
      }
      for (const rec of newTestRecords) {
        await db.TestingResult.create(rec);
      }
      results.testing_records = newTestRecords.length;
    }

    return Response.json({
      success: true,
      synced_at: new Date().toISOString(),
      ...results
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
