import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const records: Record<string, unknown>[] = body.records || [];
  const startFrom: number = body.start_from || 0;
  
  let inserted = 0;
  const errors: { idx: number; msg: string }[] = [];

  const subset = records.slice(startFrom);

  for (let i = 0; i < subset.length; i++) {
    const record = subset[i];
    let success = false;
    let attempts = 0;
    while (!success && attempts < 3) {
      try {
        await base44.asServiceRole.entities.SessionLog.create(record);
        inserted++;
        success = true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        if (msg.includes("Rate limit")) {
          attempts++;
          await sleep(1000 * attempts); // 1s, 2s, 3s backoff
        } else {
          errors.push({ idx: startFrom + i, msg });
          success = true; // skip non-rate-limit errors
        }
      }
    }
    if (!success) {
      errors.push({ idx: startFrom + i, msg: "Rate limit after 3 retries" });
    }
    // Small delay every 10 records to avoid hammering
    if ((i + 1) % 10 === 0) {
      await sleep(200);
    }
  }

  return Response.json({ success: true, inserted, errors: errors.slice(0, 20), total: subset.length });
});
