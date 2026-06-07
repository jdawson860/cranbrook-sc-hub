#!/bin/bash
# Bulk seed SessionLog records via the bulkInsertSessions backend function
# with throttled batching to avoid rate limits

set -e

DATA_FILE="/tmp/sample_data.json"
URL="https://superagent-84188511.base44.app/functions/bulkInsertSessions"
BATCH_SIZE=100
DELAY=2  # seconds between batches

TOTAL=$(python3 -c "import json; d=json.load(open('$DATA_FILE')); print(len(d))")
echo "Total records: $TOTAL"
echo "Batch size: $BATCH_SIZE, delay: ${DELAY}s"

BATCHES=$(python3 -c "import math, json; d=json.load(open('$DATA_FILE')); print(math.ceil(len(d)/$BATCH_SIZE))")
echo "Batches: $BATCHES"
echo "---"

TOTAL_CREATED=0
TOTAL_ERRORS=0

for i in $(seq 0 $((BATCHES - 1))); do
  START=$((i * BATCH_SIZE))
  BATCH=$(python3 -c "
import json
d=json.load(open('$DATA_FILE'))
chunk=d[$START:$START+$BATCH_SIZE]
print(json.dumps({'records': chunk}))
")
  
  RESULT=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -d "$BATCH" \
    --max-time 30)
  
  CREATED=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('created',0))" 2>/dev/null || echo 0)
  ERRORS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('errors',[])))" 2>/dev/null || echo 0)
  
  TOTAL_CREATED=$((TOTAL_CREATED + CREATED))
  TOTAL_ERRORS=$((TOTAL_ERRORS + ERRORS))
  
  echo "Batch $((i+1))/$BATCHES: ✅ $CREATED created, ❌ $ERRORS errors (running total: $TOTAL_CREATED)"
  
  sleep $DELAY
done

echo "==="
echo "DONE: ✅ $TOTAL_CREATED inserted, ❌ $TOTAL_ERRORS errors"
