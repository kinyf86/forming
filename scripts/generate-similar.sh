#!/bin/bash
# Generate 3 similar problems for each source problem
cd /Users/forming/dev/forming

PROBLEMS=("g5-ch4-01" "g5-ch4-02" "g5-ch4-03" "g5-ch5-01" "g5-ch5-02")

for pid in "${PROBLEMS[@]}"; do
  echo "=== Generating similar problems for $pid ==="

  QUESTION=$(python3 -c "import json; d=json.load(open('src/data/generated/${pid}.json')); print(d['question'])")
  TOPIC=$(python3 -c "import json; d=json.load(open('src/data/generated/${pid}.json')); print(d['topicId'])")
  DIFF=$(python3 -c "import json; d=json.load(open('src/data/generated/${pid}.json')); print(d['difficulty'])")
  CONCEPTS=$(python3 -c "import json; d=json.load(open('src/data/generated/${pid}.json')); print(', '.join(d['concepts']))")

  PROMPT="당신은 초등학교 수학 튜터입니다.

아래 원본 문제와 비슷한 유형의 객관식 문제를 3개 생성해주세요.
숫자와 조건만 바꿔서 같은 개념을 연습할 수 있도록 해주세요.

## 원본 문제
${QUESTION}

## 관련 개념
${CONCEPTS}

## 난이도
${DIFF}

## 요청사항
- 각 문제에 choices 5개 (정답 1개 + 오답 4개)
- answer는 choices 중 하나와 정확히 일치
- solution에 단계별 풀이 포함
- hints 2개씩 포함
반드시 아래 JSON 배열 형식으로만 응답하세요.

[
  {
    \"id\": \"${pid}-sim1\",
    \"topicId\": \"${TOPIC}\",
    \"question\": \"...\",
    \"difficulty\": ${DIFF},
    \"hints\": [\"...\", \"...\"],
    \"choices\": [\"...\", \"...\", \"...\", \"...\", \"...\"],
    \"solution\": \"...\",
    \"answer\": \"...\",
    \"concepts\": [\"...\"]
  },
  {
    \"id\": \"${pid}-sim2\",
    ...
  },
  {
    \"id\": \"${pid}-sim3\",
    ...
  }
]"

  RESULT=$(claude -p "$PROMPT" --output-format text --model claude-sonnet-4-6 2>/dev/null)

  # Parse and save each problem
  python3 -c "
import json, sys, re

text = '''${RESULT}'''
# Try to find JSON array
match = re.search(r'\[[\s\S]*\]', text)
if not match:
    print('ERROR: Could not parse JSON for ${pid}')
    sys.exit(1)

problems = json.loads(match.group())
for p in problems:
    path = f'src/data/generated/{p[\"id\"]}.json'
    with open(path, 'w') as f:
        json.dump(p, f, ensure_ascii=False, indent=2)
    print(f'  Saved: {p[\"id\"]}')
" 2>&1

done

echo "=== Done ==="
