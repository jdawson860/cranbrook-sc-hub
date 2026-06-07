import { createClient } from 'npm:@base44/sdk@0.8.31';

const base44 = createClient();

async function main() {
  try {
    const data_file = Deno.args[0] || '/tmp/remaining_clean.json';
    
    // Read the data
    const fileContent = await Deno.readTextFile(data_file);
    const allRecords = JSON.parse(fileContent) as Record<string, unknown>[];

    console.log(`Loaded ${allRecords.length} records from ${data_file}`);

    // Process in batches of 500
    const batchSize = 500;
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, Math.min(i + batchSize, allRecords.length));
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allRecords.length / batchSize);

      console.log(
        `\nBatch ${batchNum}/${totalBatches}: Inserting ${batch.length} records...`
      );

      try {
        // Use the SDK to insert via the service role to bypass RLS
        const result = await (base44 as any).asServiceRole.entities.SessionLog.create(batch);
        const inserted = Array.isArray(result) ? result.length : 1;
        totalInserted += inserted;
        console.log(`✓ Inserted ${inserted} records (total: ${totalInserted})`);
      } catch (err: any) {
        console.error(`✗ Batch ${batchNum} failed: ${err.message}`);
        totalErrors += batch.length;
      }
    }

    console.log(`\n═══════════════════════════════════════`);
    console.log(`Total inserted: ${totalInserted} records`);
    console.log(`Total errors: ${totalErrors} records`);
    console.log(`═══════════════════════════════════════`);

    return { ok: true, inserted: totalInserted, errors: totalErrors };
  } catch (err: any) {
    console.error(`Fatal error: ${err.message}`);
    throw err;
  }
}

main().catch(console.error);
