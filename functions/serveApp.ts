const HTML_URL = 'https://base44.app/api/apps/6a2139cf1719e3fb84188511/files/mp/public/6a2139cf1719e3fb84188511/50c27a6d0_app.html';

Deno.serve(async (_req) => {
  const resp = await fetch(HTML_URL);
  const html = await resp.text();
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Frame-Options': 'SAMEORIGIN',
    }
  });
});
