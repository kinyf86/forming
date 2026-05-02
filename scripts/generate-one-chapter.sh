#!/bin/bash
# Generate lesson for a single chapter via CLI
# Usage: ./scripts/generate-one-chapter.sh math-3-1-01

cd "$(dirname "$0")/.."

CHAPTER_ID="$1"
if [ -z "$CHAPTER_ID" ]; then
  echo "Usage: $0 <chapterId>"
  exit 1
fi

OUTPUT="src/data/lessons/${CHAPTER_ID}.json"
if [ -f "$OUTPUT" ]; then
  echo "SKIP: $OUTPUT already exists"
  exit 0
fi

SKILL_PROMPT=$(cat src/data/prompts/generate-lesson.md)

# Extract chapter info from curriculum
CHAPTER_INFO=$(python3 -c "
import json, glob
for f in glob.glob('src/data/curriculum/*.json'):
    data = json.load(open(f))
    prefix = 'math' if data['subject'] == 'math' else 'sci'
    for sem in data['semesters']:
        for ch in sem['chapters']:
            if ch['id'] == '${CHAPTER_ID}':
                print(json.dumps({
                    'grade': data['grade'],
                    'subject': data['subject'],
                    'chapter': ch['chapter'],
                    'title': ch['title'],
                    'concepts': ch['concepts'],
                    'curriculum': data['curriculum']
                }, ensure_ascii=False))
                exit()
print('NOT_FOUND')
")

if [ "$CHAPTER_INFO" = "NOT_FOUND" ]; then
  echo "ERROR: Chapter $CHAPTER_ID not found"
  exit 1
fi

GRADE=$(echo "$CHAPTER_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['grade'])")
SUBJECT=$(echo "$CHAPTER_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print('수학' if d['subject']=='math' else '과학')")
CHAPTER_NUM=$(echo "$CHAPTER_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['chapter'])")
TITLE=$(echo "$CHAPTER_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'])")
CONCEPTS=$(echo "$CHAPTER_INFO" | python3 -c "import sys,json; print(', '.join(json.load(sys.stdin)['concepts']))")

# Build available curriculum for prerequisites
SAME_SUBJECT_CHAPTERS=$(python3 -c "
import json, glob
prefix = '${CHAPTER_ID}'.split('-')[0]
lines = []
for f in sorted(glob.glob('src/data/curriculum/*.json')):
    data = json.load(open(f))
    p = 'math' if data['subject'] == 'math' else 'sci'
    if p != prefix:
        continue
    for sem in data['semesters']:
        for ch in sem['chapters']:
            concepts = ', '.join(ch['concepts'])
            lines.append(f\"{ch['id']}: {ch['title']} ({concepts})\")
print('\n'.join(lines))
")

# Grade label
if [ "$GRADE" -le 6 ]; then
  GRADE_LABEL="초등학교 ${GRADE}학년"
elif [ "$GRADE" -le 9 ]; then
  MIDDLE=$(( GRADE - 6 ))
  GRADE_LABEL="중학교 ${MIDDLE}학년"
else
  HIGH=$(( GRADE - 9 ))
  GRADE_LABEL="고등학교 ${HIGH}학년"
fi

# Tone
if [ "$GRADE" -le 6 ]; then
  LOCALE_PROMPT="한국어로 설명하세요. 영어 수학 용어(gcd, lcm, fraction 등)를 사용하지 말고 대한민국 초등 교육과정에서 사용하는 한국어 용어를 사용하세요. 용어를 처음 사용할 때는 괄호 안에 뜻을 함께 설명하세요."
else
  LOCALE_PROMPT="한국어로 설명하세요. 대한민국 교육과정에서 사용하는 수학/과학 용어를 사용하세요. 용어를 처음 사용할 때는 괄호 안에 뜻을 함께 설명하세요."
fi

# Get concept list as JSON array
CONCEPT_LIST=$(echo "$CHAPTER_INFO" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['concepts'], ensure_ascii=False))")

echo "Generating: $CHAPTER_ID ($TITLE) - $GRADE_LABEL"

# Generate lessons for each concept
LESSONS="[]"
CONCEPT_COUNT=$(echo "$CHAPTER_INFO" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['concepts']))")

for i in $(seq 0 $((CONCEPT_COUNT - 1))); do
  CONCEPT=$(echo "$CHAPTER_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['concepts'][$i])")
  echo "  [$((i+1))/$CONCEPT_COUNT] $CONCEPT ..."

  PROMPT_FILE=$(mktemp /tmp/lesson-prompt-XXXXXX.txt)
  cat > "$PROMPT_FILE" << PROMPTEOF
${SKILL_PROMPT}

---

## Context for This Lesson

${LOCALE_PROMPT}

- Country: 대한민국
- Student: ${GRADE_LABEL}
- Subject: ${SUBJECT}
- Unit: ${CHAPTER_NUM}단원 - ${TITLE}
- Concept to teach: ${CONCEPT}
- All concepts in this unit: ${CONCEPTS}

## Available Curriculum (for prerequisite linking)
${SAME_SUBJECT_CHAPTERS}

Return valid JSON only. No other text.
PROMPTEOF

  RESULT=$(claude -p "$(cat "$PROMPT_FILE")" --output-format text --model claude-sonnet-4-6 < /dev/null 2>/dev/null)
  rm -f "$PROMPT_FILE"

  # Extract JSON from result (strip markdown fences if present)
  JSON_RESULT=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read().strip()
# Remove markdown fences
text = re.sub(r'^\`\`\`json?\s*', '', text)
text = re.sub(r'\s*\`\`\`$', '', text)
# Find JSON object
match = re.search(r'\{[\s\S]*\}', text)
if match:
    obj = json.loads(match.group())
    print(json.dumps(obj, ensure_ascii=False))
else:
    print('PARSE_ERROR')
" 2>/dev/null)

  if [ "$JSON_RESULT" = "PARSE_ERROR" ] || [ -z "$JSON_RESULT" ]; then
    echo "    ✗ Failed to parse response, retrying..."
    sleep 5
    RESULT=$(claude -p "$(cat "$PROMPT_FILE" 2>/dev/null || echo "Generate a lesson for: $CONCEPT")" --output-format text --model claude-sonnet-4-6 < /dev/null 2>/dev/null)
    JSON_RESULT=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read().strip()
text = re.sub(r'^\`\`\`json?\s*', '', text)
text = re.sub(r'\s*\`\`\`$', '', text)
match = re.search(r'\{[\s\S]*\}', text)
if match:
    obj = json.loads(match.group())
    print(json.dumps(obj, ensure_ascii=False))
else:
    print('PARSE_ERROR')
" 2>/dev/null)

    if [ "$JSON_RESULT" = "PARSE_ERROR" ] || [ -z "$JSON_RESULT" ]; then
      echo "    ✗ Failed again, skipping concept"
      continue
    fi
  fi

  # Add concept name and append to lessons array
  LESSONS=$(python3 -c "
import json, sys
lessons = json.loads('$( echo "$LESSONS" | python3 -c "import sys; print(sys.stdin.read())" )')
new_lesson = json.loads(sys.stdin.read())
new_lesson['concept'] = '$CONCEPT'
lessons.append(new_lesson)
print(json.dumps(lessons, ensure_ascii=False))
" <<< "$JSON_RESULT" 2>/dev/null)

  echo "    ✓ Done"
  sleep 2
done

# Save the chapter lesson file
python3 -c "
import json
lessons = json.loads('''$LESSONS''')
chapter_lesson = {
    'chapterId': '${CHAPTER_ID}',
    'chapterTitle': '${CHAPTER_NUM}단원 - ${TITLE}',
    'generatedAt': '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)',
    'lessons': lessons
}
with open('${OUTPUT}', 'w') as f:
    json.dump(chapter_lesson, f, ensure_ascii=False, indent=2)
print(f'Saved: ${OUTPUT} ({len(lessons)} concepts)')
"
