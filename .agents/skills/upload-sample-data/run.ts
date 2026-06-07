import { base44 } from "npm:@base44/sdk@0.8.31";

const client = base44({ appId: "6a2139cf1719e3fb84188511" });

const data: any[] = JSON.parse(Deno.env.get("SAMPLE_DATA") || "[]");
console.log(`Uploading ${data.length} records...`);

let created = 0;
const CHUNK = 50;

for (let i = 0; i < data.length; i += CHUNK) {
  const chunk = data.slice(i, i + CHUNK);
  await Promise.all(chunk.map((r: any) =>
    client.asServiceRole.entities.SessionLog.create(r)
  ));
  created += chunk.length;
  if (created % 500 === 0) console.log(`  ${created}/${data.length} uploaded`);
}

console.log(`Done. ${created} records created.`);
