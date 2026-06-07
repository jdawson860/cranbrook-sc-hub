import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);

    // GET notes for athlete
    if (body?.action === 'list') {
      const notes = await base44.asServiceRole.entities.CoachNote.list();
      const filtered = body.athlete
        ? notes.filter((n: any) => n.athlete === body.athlete)
        : notes;
      filtered.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return Response.json({ ok: true, notes: filtered }, { headers: cors });
    }

    // CREATE a note
    if (!body?.athlete || !body?.note) {
      return Response.json({ ok: false, error: 'athlete and note required' }, { status: 400, headers: cors });
    }

    const record = {
      timestamp: new Date().toISOString(),
      athlete: body.athlete,
      session_date: body.session_date || new Date().toISOString().slice(0, 10),
      session_type: body.session_type || null,
      note: body.note,
      flag: body.flag || 'none',
    };

    await base44.asServiceRole.entities.CoachNote.create(record);
    return Response.json({ ok: true }, { status: 200, headers: cors });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500, headers: cors });
  }
});
