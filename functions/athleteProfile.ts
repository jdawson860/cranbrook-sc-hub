import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);

    if (body?.action === 'get') {
      const all = await base44.asServiceRole.entities.AthleteProfile.list();
      const profile = all.find((p: any) => p.athlete_id === body.athlete_id);
      return Response.json({ ok: true, profile: profile || null }, { headers: cors });
    }

    if (body?.action === 'list') {
      const all = await base44.asServiceRole.entities.AthleteProfile.list();
      return Response.json({ ok: true, profiles: all }, { headers: cors });
    }

    if (body?.action === 'save') {
      if (!body.athlete_id) return Response.json({ ok: false, error: 'athlete_id required' }, { status: 400, headers: cors });
      const all = await base44.asServiceRole.entities.AthleteProfile.list();
      const existing = all.find((p: any) => p.athlete_id === body.athlete_id);

      const record = {
        athlete_id: body.athlete_id,
        full_name: body.full_name || body.athlete_id,
        year_level: body.year_level || null,
        height: body.height ? parseFloat(body.height) : null,
        weight: body.weight ? parseFloat(body.weight) : null,
        date_of_birth: body.date_of_birth || null,
        position: body.position || null,
        notes: body.notes || null,
        onboarded: true,
      };

      if (existing) {
        await base44.asServiceRole.entities.AthleteProfile.update(existing.id, record);
      } else {
        await base44.asServiceRole.entities.AthleteProfile.create(record);
      }

      return Response.json({ ok: true }, { headers: cors });
    }

    return Response.json({ ok: false, error: 'Unknown action' }, { status: 400, headers: cors });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500, headers: cors });
  }
});
