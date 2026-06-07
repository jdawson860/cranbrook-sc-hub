import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns squad-wide wellness data for the coach dashboard
// Response:
// {
//   ok: true,
//   athletes: string[],
//   latest: { athlete, readiness_score, sleep, soreness, motivation, timestamp }[],  // most recent check-in per athlete
//   series: { athlete, date, readiness_score, sleep, soreness, motivation }[],       // last 28 days all athletes
//   squad_avg_readiness: number,
//   low_readiness: string[],  // athletes < 5.0 today
// }

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
    const { athlete } = body; // optional: filter to one athlete

    const allWellness = await base44.asServiceRole.entities.WellnessCheckIn.list();

    // Filter to last 28 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);

    const recent = allWellness
      .filter((w: any) => new Date(w.timestamp) >= cutoff)
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // If filtering to one athlete
    const filtered = athlete ? recent.filter((w: any) => w.athlete === athlete) : recent;

    // Latest check-in per athlete
    const latestMap: Record<string, any> = {};
    for (const w of recent) {
      if (!latestMap[w.athlete]) latestMap[w.athlete] = w;
    }
    const latest = Object.values(latestMap).map((w: any) => ({
      athlete: w.athlete,
      readiness_score: w.readiness_score,
      sleep: w.sleep,
      soreness: w.soreness,
      motivation: w.motivation,
      notes: w.notes,
      timestamp: w.timestamp,
      date: w.timestamp?.slice(0, 10),
    })).sort((a: any, b: any) => (a.readiness_score ?? 10) - (b.readiness_score ?? 10));

    // Squad avg readiness (latest per athlete)
    const readinessScores = latest.map((w: any) => w.readiness_score).filter((s: any) => s != null);
    const squad_avg_readiness = readinessScores.length
      ? parseFloat((readinessScores.reduce((a: number, b: number) => a + b, 0) / readinessScores.length).toFixed(1))
      : null;

    // Athletes flagged low readiness (< 5.0)
    const low_readiness = latest.filter((w: any) => (w.readiness_score ?? 10) < 5).map((w: any) => w.athlete);

    // Series: all records, shaped for charting
    const series = filtered.map((w: any) => ({
      athlete: w.athlete,
      date: w.timestamp?.slice(0, 10),
      readiness_score: w.readiness_score,
      sleep: w.sleep,
      soreness: w.soreness,
      motivation: w.motivation,
      notes: w.notes,
    }));

    // Unique athletes
    const athletes = [...new Set(recent.map((w: any) => w.athlete as string))].sort();

    return Response.json({
      ok: true,
      athletes,
      latest,
      series,
      squad_avg_readiness,
      low_readiness,
    }, { status: 200, headers: cors });

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: cors });
  }
});
