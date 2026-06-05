export default async function handler(req: Request): Promise<Response> {
  return new Response("<h1>Hello from serveApp</h1>", {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
