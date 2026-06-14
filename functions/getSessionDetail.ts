// getSessionDetail v3 — reads from Athlete Hub Responses Google Sheet (same source as getDashboardData)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID     = "1_6BgfNQzfoxxRwf9oAYkto0FBX8ihUZgDFe3CRE-Xuk";
const SHEETS_API   = "https://sheets.googleapis.com/v4/spreadsheets";
const SOURCE_SHEET = "Athlete Hub Responses";

const ABBREV = new Set(['BB','DB','SB','KB','RDL','GHD','ISO','RFESS','TRX','RM']);

function toTitleCase(s: string): string {
  if (!s) return s;
  return s.trim().split(/\s+/).map(w => {
    const u = w.toUpperCase();
    return ABBREV.has(u) ? u : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function parseDate(val: string): string | null {
  if (!val) return null;
  const datePart = val.trim().split(' ')[0];
  const slashParts = datePart.split('/');
  if (slashParts.length === 3) {
    const [m, d, y] = slashParts;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T09:00:00`;
  }
  if (datePart.length >= 10) return datePart.slice(0,10) + 'T09:00:00';
  return null;
}

const SESSION_EXERCISE_ORDER: Record<string, string[]> = {
  'Lower A': ['BB High Pull','Hurdle Jump & Stick Landing','BB Back Squat (Heels Elevated)','Ankle Mobility Dorsiflexion','Front Foot Elevated Split Squat','GHD Anti-Lateral Flexion Hold','Eccentric Hamstring Sliders','Single Leg Calf Raise on Step'],
  'Lower B': ['BB RDL','SB Roll Out + Plank Hold','Leg Press','Hanging Straight Leg Raise','Leg Extension','Landmine Rotation','Single Leg Hip Thrust','Single Leg Calf Raise on Step'],
  'Upper A': ['Chin Ups','Bench Press','Single Arm DB Row','Incline DB Bench Press','Reverse DB Flys (Chest Supported)','Plate Weighted Sit Ups','Swiss Ball Deadbug'],
  'Upper B': ['Bench Pull','Half Kneeling Wall Thoracic Rotation','BB Shoulder Press','Half Kneeling Banded Cuban Press','DB Lateral Raise','Biceps of Your Choice','Pallof Press ISO Hold'],
};

function sortExercises(exercises: string[], sessionType: string): string[] {
  const canonical = SESSION_EXERCISE_ORDER[sessionType] || [];
  return [...exercises].sort((a, b) => {
    const ia = canonical.findIndex(e => e.toUpperCase() === a.toUpperCase());
    const ib = canonical.findIndex(e => e.toUpperCase() === b.toUpperCase());
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

async function fetchSheetLogs(token: string): Promise<any[]> {
  const url = `${SHEETS_API}/${SHEET_ID}/values/${encodeURIComponent(SOURCE_SHEET)}!A1:I2000`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const data: any = await res.json();
  const rows: string[][] = data.values || [];

  // Col layout: Timestamp(0) | Date(1) | Athlete(2) | Session Type(3) | Exercise(4) | Set(5) | Reps(6) | Load(7) | RPE(8)
  const dataRows = rows.slice(1).filter(r => r && (r[0] || r[1]) && r[2] && r[3] && r[4]);
  const groups = new Map<string, number>();
  const logs: any[] = [];

  for (const row of dataRows) {
    const rawDate = (row[1] && row[1].trim()) ? row[1] : row[0];
    const ts = parseDate(rawDate);
    if (!ts) continue;

    const athlete      = row[2].trim().toUpperCase();
    const session_type = row[3].trim();
    const exercise     = toTitleCase(row[4]);
    const reps         = row[6] ? parseFloat(row[6]) : 0;
    const load         = row[7] ? row[7].trim() : '0';
    const rpe          = row[8] ? parseFloat(row[8]) : 0;

    const hasData = reps !== 0 || (load !== '0' && load !== '' && load !== 'null') || rpe !== 0;
    if (!hasData) continue;

    const dateKey  = ts.slice(0, 10);
    const groupKey = `${athlete}|${dateKey}|${session_type}|${exercise}`;
    const setNum   = (groups.get(groupKey) || 0) + 1;
    groups.set(groupKey, setNum);

    logs.push({ timestamp: ts, athlete, session_type, exercise, set_number: setNum, reps, load, rpe });
  }

  return logs;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { athlete, date, session_type } = body;

    const { accessToken: sheetsToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const allLogs = await fetchSheetLogs(sheetsToken);

    // Build session index for the athlete
    const athleteLogs = allLogs.filter(l => !athlete || l.athlete === athlete);
    const sessionMap: Record<string, { date: string; session_type: string; athlete: string }> = {};
    for (const log of athleteLogs) {
      const d = log.timestamp?.split('T')[0];
      if (!d) continue;
      const key = `${log.athlete}|${d}|${log.session_type}`;
      if (!sessionMap[key]) sessionMap[key] = { date: d, session_type: log.session_type, athlete: log.athlete };
    }
    const sessions: Record<string, any[]> = {};
    for (const s of Object.values(sessionMap)) {
      if (!sessions[s.athlete]) sessions[s.athlete] = [];
      sessions[s.athlete].push(s);
    }
    for (const ath of Object.keys(sessions)) {
      sessions[ath].sort((a, b) => b.date.localeCompare(a.date));
    }

    // Build detailed view for a specific session
    let sessionDetail = null;
    if (athlete && date && session_type) {
      const sets = allLogs.filter(l =>
        l.athlete === athlete &&
        l.timestamp?.startsWith(date) &&
        l.session_type === session_type
      );

      const byExercise: Record<string, any[]> = {};
      const exerciseOrder: string[] = [];

      for (const s of sets) {
        if (!s.exercise) continue;
        if (!byExercise[s.exercise]) { byExercise[s.exercise] = []; exerciseOrder.push(s.exercise); }
        byExercise[s.exercise].push({
          set: s.set_number,
          reps: s.reps,
          load: s.load,
          rpe: s.rpe,
          timestamp: s.timestamp,
        });
      }

      const sortedExercises = sortExercises(exerciseOrder, session_type);
      for (const ex of sortedExercises) {
        byExercise[ex].sort((a: any, b: any) => (a.set || 0) - (b.set || 0));
      }

      const withRpe = sets.filter(s => s.rpe);
      const avgRpe = withRpe.length
        ? parseFloat((withRpe.reduce((a, s) => a + (s.rpe || 0), 0) / withRpe.length).toFixed(1))
        : null;
      const totalLoad = sets.reduce((a, s) => {
        const l = parseFloat(s.load);
        return a + (isNaN(l) ? 0 : l * (parseFloat(s.reps) || 1));
      }, 0);

      sessionDetail = {
        athlete, date, session_type,
        exercises: sortedExercises.map(name => ({ name, sets: byExercise[name] })),
        total_sets: sets.length,
        avg_rpe: avgRpe,
        total_load: Math.round(totalLoad),
      };
    }

    return Response.json({ ok: true, session_index: sessions, session_detail: sessionDetail }, { status: 200, headers: cors });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500, headers: cors });
  }
});
