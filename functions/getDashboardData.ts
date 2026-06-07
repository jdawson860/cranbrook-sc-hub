import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function buildDailyLoad(logs: any[]): Record<string, number> {
  const daily: Record<string, number> = {};
  for (const r of logs) {
    const date = r.timestamp?.split('T')[0];
    if (!date) continue;
    const load = parseFloat(r.load);
    const reps = r.reps || 1;
    if (!isNaN(load)) {
      daily[date] = (daily[date] || 0) + load * reps;
    }
  }
  return daily;
}

function rollingMean(daily: Record<string, number>, endDate: string, days: number): number {
  const end = new Date(endDate);
  let total = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = d.toISOString().split('T')[0];
    total += daily[key] || 0;
  }
  return total / days;
}

function computeACWR(logs: any[]): { date: string, acute: number, chronic: number, acwr: number, dailyLoad: number }[] {
  const daily = buildDailyLoad(logs);
  if (Object.keys(daily).length === 0) return [];
  const allDates = Object.keys(daily).sort();
  const start = new Date(allDates[0]);
  const end = new Date();
  const points: { date: string, acute: number, chronic: number, acwr: number, dailyLoad: number }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const acute = rollingMean(daily, dateStr, 7);
    const chronic = rollingMean(daily, dateStr, 28);
    const acwr = chronic > 0 ? parseFloat((acute / chronic).toFixed(2)) : 0;
    const daysSinceStart = Math.floor((d.getTime() - start.getTime()) / 86400000);
    if (daysSinceStart >= 6) {
      points.push({ date: dateStr, acute: Math.round(acute), chronic: Math.round(chronic), acwr, dailyLoad: Math.round(daily[dateStr] || 0) });
    }
  }
  return points;
}

function buildExerciseProgressions(logs: any[]): { exercise: string, points: { date: string, avgLoad: number | null, avgRpe: number | null }[] }[] {
  const exerciseOrder: string[] = [];
  const byExercise: Record<string, any[]> = {};
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (const r of sorted) {
    if (!r.exercise) continue;
    if (!byExercise[r.exercise]) { byExercise[r.exercise] = []; exerciseOrder.push(r.exercise); }
    byExercise[r.exercise].push(r);
  }
  return exerciseOrder.map(ex => {
    const byDate: Record<string, any[]> = {};
    for (const r of byExercise[ex]) {
      const date = r.timestamp?.split('T')[0];
      if (!date) continue;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(r);
    }
    const points = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, sets]) => {
      const loads = sets.map(s => parseFloat(s.load)).filter(l => !isNaN(l) && l > 0);
      const rpes = sets.map(s => s.rpe).filter(r => r != null);
      return {
        date,
        avgLoad: loads.length ? parseFloat((loads.reduce((a, v) => a + v, 0) / loads.length).toFixed(1)) : null,
        avgRpe: rpes.length ? parseFloat((rpes.reduce((a, v) => a + v, 0) / rpes.length).toFixed(1)) : null,
      };
    });
    return { exercise: ex, points };
  });
}

function buildSessionHistory(logs: any[]): any[] {
  const seen = new Set<string>();
  const sessions: any[] = [];
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (const r of sorted) {
    const date = r.timestamp?.split('T')[0];
    const key = `${date}|${r.session_type}`;
    if (!seen.has(key)) {
      seen.add(key);
      const sets = logs.filter(l => l.timestamp?.startsWith(date) && l.session_type === r.session_type);
      const exerciseOrder: string[] = [];
      const exSeen = new Set<string>();
      [...sets]
        .sort((a, b) => (a.set_number || 0) - (b.set_number || 0) || new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .forEach(s => { if (s.exercise && !exSeen.has(s.exercise)) { exSeen.add(s.exercise); exerciseOrder.push(s.exercise); } });
      const rpes = sets.filter(s => s.rpe).map(s => s.rpe);
      const tl = sets.reduce((a, s) => { const l = parseFloat(s.load); return a + (isNaN(l) ? 0 : l * (s.reps || 1)); }, 0);
      sessions.push({
        date,
        session_type: r.session_type,
        totalSets: sets.length,
        avgRpe: rpes.length ? parseFloat((rpes.reduce((a, v) => a + v, 0) / rpes.length).toFixed(1)) : null,
        totalLoad: Math.round(tl),
        exercises: exerciseOrder,
      });
    }
  }
  return sessions.sort((a, b) => b.date.localeCompare(a.date));
}

// Detect progressive overload spikes (>10% week-over-week per exercise)
function detectOverloadFlags(logs: any[]): { athlete: string, exercise: string, prevWeekLoad: number, thisWeekLoad: number, pct: number }[] {
  const flags: { athlete: string, exercise: string, prevWeekLoad: number, thisWeekLoad: number, pct: number }[] = [];
  const now = new Date();
  const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 7);
  const prevWeekStart = new Date(now); prevWeekStart.setDate(now.getDate() - 14);

  const byAthleteExercise: Record<string, Record<string, { thisWeek: number, prevWeek: number }>> = {};
  for (const r of logs) {
    const d = new Date(r.timestamp);
    const load = parseFloat(r.load);
    if (isNaN(load) || load <= 0 || !r.exercise) continue;
    const vol = load * (r.reps || 1);
    if (!byAthleteExercise[r.athlete]) byAthleteExercise[r.athlete] = {};
    if (!byAthleteExercise[r.athlete][r.exercise]) byAthleteExercise[r.athlete][r.exercise] = { thisWeek: 0, prevWeek: 0 };
    if (d >= thisWeekStart) byAthleteExercise[r.athlete][r.exercise].thisWeek += vol;
    else if (d >= prevWeekStart) byAthleteExercise[r.athlete][r.exercise].prevWeek += vol;
  }

  for (const [athlete, exercises] of Object.entries(byAthleteExercise)) {
    for (const [exercise, { thisWeek, prevWeek }] of Object.entries(exercises)) {
      if (prevWeek > 0 && thisWeek > 0) {
        const pct = Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
        if (pct > 10) {
          flags.push({ athlete, exercise, prevWeekLoad: Math.round(prevWeek), thisWeekLoad: Math.round(thisWeek), pct });
        }
      }
    }
  }
  return flags.sort((a, b) => b.pct - a.pct);
}

// Build 28-day squad daily load for calendar view
function buildSquadLoadCalendar(allLogs: any[]): { date: string, totalLoad: number, athletes: number, sessions: number }[] {
  const byDate: Record<string, { load: number, athletes: Set<string>, sessions: Set<string> }> = {};
  for (const r of allLogs) {
    const date = r.timestamp?.split('T')[0];
    if (!date) continue;
    const load = parseFloat(r.load);
    if (!byDate[date]) byDate[date] = { load: 0, athletes: new Set(), sessions: new Set() };
    if (!isNaN(load)) byDate[date].load += load * (r.reps || 1);
    byDate[date].athletes.add(r.athlete);
    byDate[date].sessions.add(`${r.athlete}|${r.session_type}`);
  }
  const now = new Date();
  const result = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const date = d.toISOString().split('T')[0];
    const entry = byDate[date];
    result.push({
      date,
      totalLoad: entry ? Math.round(entry.load) : 0,
      athletes: entry ? entry.athletes.size : 0,
      sessions: entry ? entry.sessions.size : 0,
    });
  }
  return result;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { view, athlete } = body;

    const [allLogs, allWellness] = await Promise.all([
      base44.asServiceRole.entities.SessionLog.list(),
      base44.asServiceRole.entities.WellnessCheckIn.list(),
    ]);

    // Group by athlete
    const byAthlete: Record<string, any[]> = {};
    for (const r of allLogs) {
      if (!byAthlete[r.athlete]) byAthlete[r.athlete] = [];
      byAthlete[r.athlete].push(r);
    }

    const athletes = Object.keys(byAthlete).sort();
    const now = new Date();
    const week7 = new Date(now); week7.setDate(now.getDate() - 7);

    // Squad heatmap: this week, each athlete x session type
    const sessionTypes = ['Lower A', 'Lower B', 'Upper A', 'Upper B'];
    const heatmap: Record<string, Record<string, boolean>> = {};
    for (const ath of athletes) {
      heatmap[ath] = {};
      for (const st of sessionTypes) heatmap[ath][st] = false;
      for (const r of byAthlete[ath]) {
        if (new Date(r.timestamp) >= week7) heatmap[ath][r.session_type] = true;
      }
    }

    // Wellness — last check-in per athlete
    const wellnessByAthlete: Record<string, any> = {};
    for (const w of allWellness) {
      const ath = w.athlete;
      if (!wellnessByAthlete[ath] || new Date(w.timestamp) > new Date(wellnessByAthlete[ath].timestamp)) {
        wellnessByAthlete[ath] = w;
      }
    }

    // Per-athlete summaries
    const athleteSummaries = athletes.map(ath => {
      const logs = byAthlete[ath];
      const recent = logs.filter(r => new Date(r.timestamp) >= week7);
      const acwrData = computeACWR(logs);
      const latestAcwr = acwrData.length ? acwrData[acwrData.length - 1] : null;
      const avgRpe = logs.filter(r => r.rpe).length
        ? parseFloat((logs.reduce((a, r) => a + (r.rpe || 0), 0) / logs.filter(r => r.rpe).length).toFixed(1))
        : null;
      const wkLoad = recent.reduce((a, r) => { const l = parseFloat(r.load); return a + (isNaN(l) ? 0 : l * (r.reps || 1)); }, 0);
      const lastLog = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      const daysSinceLast = lastLog ? Math.floor((now.getTime() - new Date(lastLog.timestamp).getTime()) / 86400000) : null;
      const wellness = wellnessByAthlete[ath] || null;
      const sessionCounts: Record<string, number> = {};
      for (const st of sessionTypes) sessionCounts[st] = 0;
      for (const r of logs) { if (sessionCounts[r.session_type] !== undefined) sessionCounts[r.session_type]++; }

      return {
        athlete: ath,
        total_sessions: logs.length,
        recent_sessions: recent.length,
        avg_rpe: avgRpe,
        acwr: latestAcwr?.acwr ?? null,
        acute: latestAcwr?.acute ?? null,
        chronic: latestAcwr?.chronic ?? null,
        weekly_load: Math.round(wkLoad),
        session_counts: sessionCounts,
        days_since_last: daysSinceLast,
        acwr_history: acwrData.slice(-28),
        latestACWR: latestAcwr,
        wellness_readiness: wellness?.readiness_score ?? null,
        wellness_date: wellness?.timestamp?.slice(0, 10) ?? null,
        wellness_sleep: wellness?.sleep ?? null,
        wellness_soreness: wellness?.soreness ?? null,
        wellness_motivation: wellness?.motivation ?? null,
      };
    });

    const squadCalendar = buildSquadLoadCalendar(allLogs);
    const overloadFlags = detectOverloadFlags(allLogs);

    const totalSessions = allLogs.length;
    const activeThisWeek = athletes.filter(a => byAthlete[a].some(r => new Date(r.timestamp) >= week7)).length;
    const allRpes = allLogs.filter(r => r.rpe).map(r => r.rpe);
    const avgSquadRpe = allRpes.length ? parseFloat((allRpes.reduce((a, v) => a + v, 0) / allRpes.length).toFixed(1)) : null;

    // Individual athlete detail
    let individualDetail = null;
    if (athlete && byAthlete[athlete]) {
      const logs = byAthlete[athlete];
      const acwrData = computeACWR(logs);
      const latestACWR = acwrData.length ? acwrData[acwrData.length - 1] : null;
      const sessionHistory = buildSessionHistory(logs);
      const exerciseProgressions = buildExerciseProgressions(logs);
      const athleteWellness = allWellness.filter((w: any) => w.athlete === athlete)
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 14);

      individualDetail = {
        athlete,
        logs: [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
        acwrSeries: acwrData,
        latestACWR,
        sessionHistory,
        exerciseProgressions,
        wellnessSeries: athleteWellness,
      };
    }

    return Response.json({
      ok: true,
      athletes,
      athlete_summaries: athleteSummaries,
      squad: {
        total_sessions: totalSessions,
        active_this_week: activeThisWeek,
        total_athletes: athletes.length,
        avg_rpe: avgSquadRpe,
      },
      heatmap,
      session_types: sessionTypes,
      squadCalendar,
      overloadFlags,
      individual: individualDetail,
      ...(individualDetail || {}),
    }, { status: 200, headers: cors });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500, headers: cors });
  }
});
