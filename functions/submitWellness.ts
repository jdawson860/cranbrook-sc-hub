import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);
    if (!body?.athlete) return Response.json({ ok: false, error: 'athlete required' }, { status: 400, headers: cors });

    const sleep = parseFloat(body.sleep) || 0;
    const soreness = parseFloat(body.soreness) || 0;
    const motivation = parseFloat(body.motivation) || 0;
    // Readiness: sleep and motivation positive, soreness negative
    // Score out of 10: avg of sleep + motivation - soreness penalty
    const readiness_score = parseFloat(((sleep + motivation + (6 - soreness)) / 3).toFixed(1));

    const record = {
      timestamp: new Date().toISOString(),
      athlete: body.athlete,
      sleep,
      soreness,
      motivation,
      readiness_score: Math.max(1, Math.min(10, readiness_score)),
      notes: body.notes || null,
    };

    await base44.asServiceRole.entities.WellnessCheckIn.create(record);

    return Response.json({ ok: true, readiness_score: record.readiness_score }, { status: 200, headers: cors });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500, headers: cors });
  }
});
