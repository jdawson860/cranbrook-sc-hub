// Submit an on-water rowing session
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);

    if (!body?.athlete || !body?.session_type) {
      return Response.json({ ok: false, error: 'athlete and session_type are required' }, { status: 400, headers: cors });
    }

    const record = {
      timestamp: new Date().toISOString(),
      athlete: body.athlete,
      session_type: body.session_type,
      boat_type: body.boat_type || null,
      distance: body.distance ? parseFloat(body.distance) : null,
      duration: body.duration || null,
      avg_split: body.avg_split || null,
      rating: body.rating ? parseFloat(body.rating) : null,
      avg_heart_rate: body.avg_heart_rate ? parseFloat(body.avg_heart_rate) : null,
      rpe: body.rpe ? parseFloat(body.rpe) : null,
      conditions: body.conditions || null,
      pieces: body.pieces || null,
      athlete_notes: body.athlete_notes || null,
      coach_notes: body.coach_notes || null,
    };

    await base44.asServiceRole.entities.WaterSession.create(record);

    return Response.json({ ok: true, created: 1 }, { status: 200, headers: cors });

  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500, headers: cors });
  }
});
