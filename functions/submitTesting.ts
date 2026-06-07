// Submit a core testing result from the testing form
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

    if (!body?.athlete_name || !body?.year_level) {
      return Response.json({ ok: false, error: 'athlete_name and year_level are required' }, { status: 400, headers: cors });
    }

    const record = {
      timestamp: new Date().toISOString(),
      athlete_name: body.athlete_name,
      athlete_first: body.athlete_first || body.athlete_name.split(' ')[0] || '',
      athlete_last: body.athlete_last || body.athlete_name.split(' ').slice(1).join(' ') || '',
      year_level: String(body.year_level),
      height: body.height ? parseFloat(body.height) : null,
      weight: body.weight ? parseFloat(body.weight) : null,
      hollow_hold: body.hollow_hold ? parseFloat(body.hollow_hold) : null,
      prone_plank: body.prone_plank ? parseFloat(body.prone_plank) : null,
      side_plank_left: body.side_plank_left ? parseFloat(body.side_plank_left) : null,
      side_plank_right: body.side_plank_right ? parseFloat(body.side_plank_right) : null,
    };

    await base44.asServiceRole.entities.TestingResult.create(record);

    return Response.json({ ok: true, created: 1 }, { status: 200, headers: cors });

  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500, headers: cors });
  }
});
