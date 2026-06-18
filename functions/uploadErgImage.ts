// Uploads a base64 erg screen image to storage and updates the ErgSession record
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APP_ID = "6a2139cf1719e3fb84188511";

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
    if (!body?.image_base64 || !body?.session_id) {
      return Response.json({ ok: false, error: 'Missing image_base64 or session_id' }, { status: 400, headers: cors });
    }

    const { image_base64, session_id, mime_type = 'image/jpeg' } = body;

    // Decode base64 to bytes
    const imageBytes = Uint8Array.from(atob(image_base64), c => c.charCodeAt(0));

    // Upload to Base44 public storage
    const ext = mime_type.includes('png') ? 'png' : mime_type.includes('gif') ? 'gif' : 'jpg';
    const filename = `erg_screen_${session_id}_${Date.now()}.${ext}`;

    const uploadResp = await fetch(`https://app.base44.com/api/apps/${APP_ID}/storage/upload`, {
      method: 'POST',
      headers: {
        'api_key': Deno.env.get('BASE44_SERVICE_TOKEN') || '',
        'Content-Type': mime_type,
        'X-Filename': filename,
      },
      body: imageBytes,
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.text();
      return Response.json({ ok: false, error: `Upload failed: ${err}` }, { status: 500, headers: cors });
    }

    const uploadData = await uploadResp.json();
    const image_url = uploadData.file_url || uploadData.url || uploadData.public_url;

    if (!image_url) {
      return Response.json({ ok: false, error: 'No URL returned from storage' }, { status: 500, headers: cors });
    }

    // Update the ErgSession record
    await base44.asServiceRole.entities.ErgSession.update(session_id, { image_url });

    return Response.json({ ok: true, image_url }, { headers: cors });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
