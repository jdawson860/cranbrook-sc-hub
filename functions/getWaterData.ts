// Returns on-water session data for the coach dashboard
import { createClient } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const base44 = createClient({ appId: "6a2139cf1719e3fb84188511", serviceToken: Deno.env.get("BASE44_SERVICE_TOKEN") || "" });
    const body = await req.json().catch(() => ({}));

    const sessions = await base44.asServiceRole.entities.WaterSession.list();

    // Sort by timestamp desc
    sessions.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Per-athlete summary
    const byAthlete: Record<string, any[]> = {};
    for (const s of sessions) {
      const ath = s.athlete;
      if (!ath) continue;
      if (!byAthlete[ath]) byAthlete[ath] = [];
      byAthlete[ath].push(s);
    }

    const athleteSummaries = Object.entries(byAthlete).map(([athlete, sList]) => {
      const rpes = sList.filter((s: any) => s.rpe).map((s: any) => s.rpe);
      const avgRpe = rpes.length ? parseFloat((rpes.reduce((a: number, b: number) => a + b, 0) / rpes.length).toFixed(1)) : null;
      const totalDist = sList.reduce((a: number, s: any) => a + (s.distance || 0), 0);
      const lastSession = sList[0];
      return {
        athlete,
        sessions: sList.length,
        totalDistance: Math.round(totalDist),
        avgRpe,
        lastDate: lastSession?.timestamp?.slice(0, 10),
        sessionTypes: [...new Set(sList.map((s: any) => s.session_type))],
      };
    }).sort((a, b) => a.athlete.localeCompare(b.athlete));

    // Best splits leaderboard (lowest split = best)
    const splitsLb: { athlete: string, split: string, secs: number, type: string, date: string }[] = [];
    for (const [athlete, sList] of Object.entries(byAthlete)) {
      const withSplits = (sList as any[]).filter(s => s.avg_split);
      if (!withSplits.length) continue;
      // Parse mm:ss.t
      let best: any = null;
      let bestSecs = Infinity;
      for (const s of withSplits) {
        const parts = s.avg_split.split(':');
        if (parts.length === 2) {
          const secs = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
          if (secs < bestSecs) { bestSecs = secs; best = s; }
        }
      }
      if (best) splitsLb.push({ athlete, split: best.avg_split, secs: bestSecs, type: best.session_type, date: best.timestamp?.slice(0, 10) });
    }
    splitsLb.sort((a, b) => a.secs - b.secs);

    // If athlete filter
    if (body.athlete) {
      const sList = byAthlete[body.athlete] || [];
      return Response.json({
        ok: true,
        sessions: sList,
        athleteSummaries,
        splitsLeaderboard: splitsLb,
        totalSessions: sessions.length,
      }, { status: 200, headers: cors });
    }

    return Response.json({
      ok: true,
      sessions: sessions.slice(0, 50),
      athleteSummaries,
      splitsLeaderboard: splitsLb,
      totalSessions: sessions.length,
    }, { status: 200, headers: cors });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500, headers: cors });
  }
});
