import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID = "1_6BgfNQzfoxxRwf9oAYkto0FBX8ihUZgDFe3CRE-Xuk";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

async function getSheetRows(token: string, sheetName: string, maxRows = 500): Promise<string[][]> {
  const url = `${SHEETS_API}/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:J${maxRows}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await resp.json();
  return data.values || [];
}

function sheetsDateToISO(val: string): string {
  const serial = parseFloat(val);
  if (!isNaN(serial) && serial > 40000) {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + serial * 86400000).toISOString().split('T')[0];
  }
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
    const body = await req.json().catch(() => ({}));

    // Acknowledge Drive sync ping immediately
    const state = body?.data?._provider_meta?.['x-goog-resource-state'];
    if (state === 'sync') return Response.json({ status: 'sync_ack' });

    // Get Drive token to check changes
    const { accessToken: driveToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${driveToken}` };

    // Load or initialise page token
    const existing = await db.SyncState.list();
    let syncRecord = existing.length > 0 ? existing[0] : null;

    if (!syncRecord) {
      const tokenRes = await fetch('https://www.googleapis.com/drive/v3/changes/startPageToken', { headers: authHeader });
      const { startPageToken } = await tokenRes.json();
      await db.SyncState.create({ page_token: startPageToken, last_synced_at: new Date().toISOString(), notes: 'initialized' });
      return Response.json({ status: 'initialized' });
    }

    // Fetch changes
    const baseUrl = `https://www.googleapis.com/drive/v3/changes?fields=changes(file(id,name)),newStartPageToken,nextPageToken`;
    let changesUrl = `${baseUrl}&pageToken=${syncRecord.page_token}`;
    const allChanges: any[] = [];
    let newPageToken: string | null = null;

    while (changesUrl) {
      const changesRes = await fetch(changesUrl, { headers: authHeader });
      if (!changesRes.ok) return Response.json({ status: 'api_error' });
      const page = await changesRes.json();
      allChanges.push(...(page.changes || []));
      if (page.newStartPageToken) newPageToken = page.newStartPageToken;
      changesUrl = page.nextPageToken ? `${baseUrl}&pageToken=${page.nextPageToken}` : '';
    }

    // Check if our sheet was among the changed files
    const sheetChanged = allChanges.some(c => c?.file?.id === SHEET_ID);

    if (sheetChanged || allChanges.length > 0) {
      // Get Sheets token and run a full sync
      const { accessToken: sheetsToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
      const athletes = ['AF', 'RR', 'JC', 'MA', 'TL', 'CC', 'SK', 'AS', 'AD', 'OO'];
      const newSessionRecords: any[] = [];

      for (const ath of athletes) {
        try {
          const rows = await getSheetRows(sheetsToken, `Athlete_${ath}`, 500);
          if (rows.length < 2) continue;
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
        } catch (_) {}
      }

      if (newSessionRecords.length > 0) {
        const existingLogs = await db.SessionLog.list();
        for (const rec of existingLogs) await db.SessionLog.delete(rec.id);
        for (const rec of newSessionRecords) await db.SessionLog.create(rec);
      }

      // Sync testing data
      const testRows = await getSheetRows(sheetsToken, 'Core_Testing_Responses', 500);
      const newTestRecords: any[] = [];
      for (const row of testRows.slice(1)) {
        if (row.length < 10) continue;
        const firstName = (row[1] || '').trim().toUpperCase();
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
        const existingTests = await db.TestingResult.list();
        for (const rec of existingTests) await db.TestingResult.delete(rec.id);
        for (const rec of newTestRecords) await db.TestingResult.create(rec);
      }

      if (newPageToken) {
        await db.SyncState.update(syncRecord.id, { page_token: newPageToken, last_synced_at: new Date().toISOString(), notes: `Synced ${newSessionRecords.length} sessions` });
      }

      return Response.json({ status: 'synced', sessions: newSessionRecords.length, testing: newTestRecords.length });
    }

    // No relevant changes — just update page token
    if (newPageToken) {
      await db.SyncState.update(syncRecord.id, { page_token: newPageToken, last_synced_at: new Date().toISOString() });
    }

    return Response.json({ status: 'no_changes' });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
