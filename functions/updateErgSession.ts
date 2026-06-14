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
    if (!body?.id) return Response.json({ ok: false, error: 'Missing session id' }, { status: 400, headers: cors });

    const {
      id,
      workout_type,
      total_distance,
      total_time,
      avg_split,
      avg_heart_rate,
      stroke_rate,
      rpe,
      notes,
    } = body;

    const update: Record<string, any> = {};
    if (workout_type   !== undefined) update.workout_type   = workout_type;
    if (total_distance !== undefined) update.total_distance = total_distance ? Number(total_distance) : null;
    if (total_time     !== undefined) update.total_time     = total_time || null;
    if (avg_split      !== undefined) update.avg_split      = avg_split || null;
    if (avg_heart_rate !== undefined) update.avg_heart_rate = avg_heart_rate ? Number(avg_heart_rate) : null;
    if (stroke_rate    !== undefined) update.stroke_rate    = stroke_rate ? Number(stroke_rate) : null;
    if (rpe            !== undefined) update.rpe            = rpe ? Number(rpe) : null;
    if (notes          !== undefined) update.notes          = notes || null;

    await base44.asServiceRole.entities.ErgSession.update(id, update);

    return Response.json({ ok: true, updated: id }, { headers: cors });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
