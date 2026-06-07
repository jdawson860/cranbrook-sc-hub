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
    const { records } = await req.json();

    if (!Array.isArray(records)) {
      return Response.json({ error: 'records must be an array' }, { status: 400, headers: cors });
    }

    let created = 0;
    const errors: string[] = [];

    // Insert in parallel batches of 20
    const CHUNK = 20;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        chunk.map((r: any) => base44.asServiceRole.entities.SessionLog.create({
          timestamp: r.timestamp,
          athlete: r.athlete,
          session_type: r.session_type,
          exercise: r.exercise,
          set_number: r.set_number,
          reps: r.reps,
          load: r.load,
          rpe: r.rpe,
        }))
      );
      for (const res of results) {
        if (res.status === 'fulfilled') created++;
        else errors.push(res.reason?.message || 'unknown');
      }
    }

    return Response.json({ ok: true, created, errors: errors.slice(0, 10) }, { status: 200, headers: cors });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: cors });
  }
});
