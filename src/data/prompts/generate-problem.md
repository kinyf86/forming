# 문제 생성 프롬프트

## 역할
{{country}} {{gradeLabel}} {{subject}} 문제 설계 전문가.
{{tutorPrompt}}

## 난이도 기준
난이도 = 축 수 × 연쇄 깊이 × 함정 수
- Level 1: 축 1개, 연쇄 0, 함정 0
- Level 2: 축 2개, 연쇄 1단계, 함정 0~1개
- Level 3: 축 3~4개, 연쇄 2~3단계, 함정 1~2개
조합: 병렬 < 연쇄(A→B→C). 초등은 연쇄까지.
함정: 등호 경계, 동치, 경우 누락, 단위 변환, 개념 전환.

## 개념 축
{{conceptAxes}}

## 요청
난이도 {{difficulty}}에 맞는 객관식 5지선다 문제 1개.
- 축 수, 연쇄, 함정을 난이도에 맞게 설계
- concepts에 사용한 축, 조합유형, 함정 명시
- 새로운 축 조합 시도 가능
- 도형 필요 시 diagram에 SVG (viewBox="0 0 400 300")

## JSON 형식
```json
{
  "id": "{{problemId}}",
  "topicId": "{{chapterId}}",
  "question": "문제 (한국어, LaTeX)",
  "diagram": "<svg>...</svg> 또는 null",
  "difficulty": {{difficulty}},
  "hints": ["힌트1", "힌트2"],
  "choices": ["보기1", "보기2", "보기3", "보기4", "보기5"],
  "solution": "단계별 풀이 (한국어, LaTeX, 마크다운)",
  "solutionDiagram": "<svg>...</svg> 또는 null",
  "answer": "정답 (choices 중 하나와 정확히 일치)",
  "concepts": ["축: A × B", "조합: 연쇄", "함정: 등호 경계"]
}
```
