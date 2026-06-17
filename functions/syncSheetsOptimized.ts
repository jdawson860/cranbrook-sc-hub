import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const SHEET_ID = "1_6BgfNQzfoxxRwf9oAYkto0FBX8ihUZgDFe3CRE-Xuk";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

async function getSheetRows(
  token: string,
  sheetName: string,
  maxRows = 500,
  maxCols = "N"
): Promise<string[][]> {
  const url = `${SHEETS_API}/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:${maxCols}${maxRows}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Sheet fetch failed (${sheetName}): ${resp.status}`);
  const data = (await resp.json()) as { values?: string[][] };
  return data.values || [];
}

function sheetsDateToISO(val: string): string {
  const serial = parseFloat(val);
  if (!isNaN(serial) && serial > 40000) {
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + serial * 86400000);
    return date.toISOString().split("T")[0];
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch {}
  return val;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const token = Deno.env.get("GOOGLESHEETS_ACCESS_TOKEN");
    if (!token) {
      return Response.json({
        error: "GOOGLESHEETS_ACCESS_TOKEN not set",
        success: false,
      });
    }

    const athletes = ["AF", "RR", "JC", "MA", "TL", "CC", "SK", "AS", "AD", "OO"];
    const results = {
      session_records: 0,
      testing_records: 0,
      erg_records: 0,
      errors: [] as string[],
    };

    // ── 1. SYNC SESSION DATA ────────────────────
    const newSessionRecords: Record<string, unknown>[] = [];

    for (const ath of athletes) {
      try {
        const rows = await getSheetRows(token, `Athlete_${ath}`, 500);
        if (rows.length < 2) continue;

        for (const row of rows.slice(1)) {
          if (!row[0] || !row[1] || !row[2]) continue;
          const dateStr = sheetsDateToISO(row[0]);
          newSessionRecords.push({
            timestamp: `${dateStr}T09:00:00`,
            athlete: ath,
            session_type: row[1] || "",
            exercise: row[2] || "",
            set_number: parseInt(row[3]) || 1,
            reps: row[4] || "",
            load: row[5] || "",
            rpe: row[6] ? parseInt(row[6]) : null,
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        results.errors.push(`Athlete_${ath}: ${msg}`);
      }
    }

    // Batch insert in chunks of 100
    if (newSessionRecords.length > 0) {
      for (let i = 0; i < newSessionRecords.length; i += 100) {
        const chunk = newSessionRecords.slice(i, i + 100);
        await base44.entities.SessionLog.create(chunk);
      }
      results.session_records = newSessionRecords.length;
    }

    // ── 2. SYNC TESTING DATA ────────────────────
    const testRows = await getSheetRows(token, "Core_Testing_Responses", 500);
    const newTestRecords: Record<string, unknown>[] = [];

    for (const row of testRows.slice(1)) {
      if (row.length < 10) continue;
      const firstName = (row[1] || "").trim().toUpperCase();
      if (!firstName || firstName === "TEST" || firstName === "NOTREAL") continue;

      let ts = row[0];
      try {
        ts = new Date(row[0]).toISOString();
      } catch {}

      newTestRecords.push({
        timestamp: ts,
        athlete_first: row[1]?.trim() || "",
        athlete_last: row[2]?.trim() || "",
        athlete_name: `${row[1]?.trim() || ""} ${row[2]?.trim() || ""}`.trim(),
        year_level: row[3] || "",
        height: row[4] ? parseFloat(row[4]) : null,
        weight: row[5] ? parseFloat(row[5]) : null,
        hollow_hold: row[6] ? parseFloat(row[6]) : null,
        prone_plank: row[7] ? parseFloat(row[7]) : null,
        side_plank_left: row[8] ? parseFloat(row[8]) : null,
        side_plank_right: row[9] ? parseFloat(row[9]) : null,
      });
    }

    // Batch insert testing records
    if (newTestRecords.length > 0) {
      for (let i = 0; i < newTestRecords.length; i += 100) {
        const chunk = newTestRecords.slice(i, i + 100);
        await base44.entities.TestingResult.create(chunk);
      }
      results.testing_records = newTestRecords.length;
    }

    // ── 3. SYNC ERG SESSION DATA ────────────────────
    try {
      const ergRows = await getSheetRows(token, "Erg_Session_Responses", 500, "M");
      const newErgRecords: Record<string, unknown>[] = [];

      for (const row of ergRows.slice(1)) {
        // Skip empty rows — need at least timestamp + athlete + workout_type
        if (!row[0] || !row[1] || !row[2]) continue;

        // Parse timestamp
        let ts = row[0];
        try { ts = new Date(row[0]).toISOString(); } catch {}

        newErgRecords.push({
          timestamp: ts,
          athlete: row[1]?.trim() || "",
          workout_type: row[2]?.trim() || "",
          total_distance: row[3] ? parseFloat(row[3]) : null,
          total_time: row[4]?.trim() || null,
          avg_split: row[5]?.trim() || null,
          avg_heart_rate: row[6] ? parseFloat(row[6]) : null,
          stroke_rate: row[7] ? parseFloat(row[7]) : null,
          rpe: row[8] ? parseFloat(row[8]) : null,
          intervals: row[9]?.trim() || null,
          notes: row[10]?.trim() || null,
          image_url: row[11]?.trim() || null,
        });
      }

      // Clear existing erg records and re-insert from sheet (sheet is source of truth)
      if (newErgRecords.length > 0) {
        // Delete all existing erg sessions first
        const existing = await base44.asServiceRole.entities.ErgSession.list();
        for (const rec of existing) {
          await base44.asServiceRole.entities.ErgSession.delete(rec.id);
        }
        // Insert fresh from sheet
        for (let i = 0; i < newErgRecords.length; i += 100) {
          const chunk = newErgRecords.slice(i, i + 100);
          await base44.asServiceRole.entities.ErgSession.create(chunk);
        }
        results.erg_records = newErgRecords.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Erg_Session_Responses: ${msg}`);
    }

    return Response.json({
      success: true,
      synced_at: new Date().toISOString(),
      ...results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: msg, success: false },
      { status: 500 }
    );
  }
});
