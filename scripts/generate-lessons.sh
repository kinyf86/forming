#!/bin/bash
# Generate tutor lessons for all chapters across all grades
# Uses the generate-lesson.md skill prompt via /api/tutor POST endpoint
#
# Usage:
#   ./scripts/generate-lessons.sh              # all chapters
#   ./scripts/generate-lessons.sh math 5       # grade 5 math only
#   ./scripts/generate-lessons.sh sci 6        # grade 6 science only

cd "$(dirname "$0")/.."

SUBJECT_FILTER="${1:-}"  # "math" or "sci" or empty for all
GRADE_FILTER="${2:-}"    # grade number or empty for all

BASE_URL="http://localhost:3002"

# Check if server is running
if ! curl -s -o /dev/null -w "%{http_code}" "$BASE_URL" | grep -q "200"; then
  echo "ERROR: Dev server not running at $BASE_URL"
  echo "Run 'npm run dev' first."
  exit 1
fi

# Collect all chapter IDs from curriculum files
CHAPTER_IDS=$(python3 -c "
import json, glob, os

ids = []
for f in sorted(glob.glob('src/data/curriculum/*.json')):
    data = json.load(open(f))
    subject = data['subject']  # 'math' or 'science'
    prefix = 'math' if subject == 'math' else 'sci'
    grade = data['grade']

    # Apply filters
    subject_filter = '${SUBJECT_FILTER}'
    grade_filter = '${GRADE_FILTER}'

    if subject_filter and prefix != subject_filter:
        continue
    if grade_filter and str(grade) != grade_filter:
        continue

    for sem in data['semesters']:
        for ch in sem['chapters']:
            ids.append(ch['id'])

print('\n'.join(ids))
")

TOTAL=$(echo "$CHAPTER_IDS" | wc -l | tr -d ' ')
CURRENT=0
GENERATED=0
SKIPPED=0
FAILED=0

echo "=== Lesson Generation ==="
echo "Chapters to process: $TOTAL"
echo "Filter: subject=${SUBJECT_FILTER:-all} grade=${GRADE_FILTER:-all}"
echo ""

for CHAPTER_ID in $CHAPTER_IDS; do
  CURRENT=$((CURRENT + 1))

  # Check if lesson already exists
  if [ -f "src/data/lessons/${CHAPTER_ID}.json" ]; then
    echo "[$CURRENT/$TOTAL] SKIP $CHAPTER_ID (already exists)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "[$CURRENT/$TOTAL] Generating $CHAPTER_ID ..."

  RESPONSE=$(curl -s -X POST "$BASE_URL/api/tutor" \
    -H "Content-Type: application/json" \
    -d "{\"chapterId\": \"$CHAPTER_ID\"}" \
    --max-time 300)

  STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null)

  if [ "$STATUS" = "generated" ]; then
    CONCEPTS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message',''))" 2>/dev/null)
    echo "  ✓ $CONCEPTS"
    GENERATED=$((GENERATED + 1))
  elif [ "$STATUS" = "exists" ]; then
    echo "  SKIP (exists)"
    SKIPPED=$((SKIPPED + 1))
  else
    ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','unknown'))" 2>/dev/null)
    echo "  ✗ FAILED: $ERROR"
    FAILED=$((FAILED + 1))
  fi

  # Brief pause between API calls to avoid rate limiting
  sleep 2
done

echo ""
echo "=== Done ==="
echo "Generated: $GENERATED"
echo "Skipped:   $SKIPPED"
echo "Failed:    $FAILED"
echo "Total:     $TOTAL"
