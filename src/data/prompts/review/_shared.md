# 페르소나 공통 컨텍스트

> 이 파일은 모든 페르소나 프롬프트가 공유하는 입력 schema · 출력 schema ·
> 채점 기준을 정의합니다. 페르소나별 파일에서 `{{shared}}`로 삽입됩니다.

## 입력 컨텍스트

런타임에 아래 필드들이 페르소나 프롬프트로 주입됩니다.

- `problem` — 평가 대상 문제. ProblemV2 (`schema: "forming-problem/2.0"`).
- `chapter` — 이 문제의 L1 챕터 정보.
  - `grade` (number), `subject` ("math"|"science")
  - `semesterTitle` (예: "중1 1학기 수학")
  - `chapterTitle` (예: "문자의 사용과 식의 계산")
  - `concepts` (string[]): 챕터 표준 개념 목록
- `prerequisites` (선택) — L2 lesson에서 derive된 선행 개념 목록.
- `attempt` (1, 2, 3) — fix-loop 반복 횟수.
- `previousFindings` (선택) — attempt > 1일 때 직전 라운드의 본 페르소나 출력.

## 출력 JSON schema (필수)

반드시 아래 JSON만 출력하세요. 코드펜스(```), 설명, 마크다운 모두 금지.

```json
{
  "persona": "<페르소나명 — 본 파일 상단에서 명시>",
  "score": 1~10 정수,
  "verdict": "PASS" | "WARN" | "FAIL",
  "findings": [
    {
      "severity": "info" | "warn" | "critical",
      "field": "content.question | content.choices[2] | content.solution | content.answer | content.hints[0] | axes.<axisName> | ...",
      "message": "한국어 자연어 — 무엇이 문제인지 학생/검토자 모두 이해할 수 있게",
      "suggestion": "(선택) 한국어로 수정 방향 제안"
    }
  ],
  "axisInferences": { /* 본 페르소나가 추론 권한을 가진 axis만, 없으면 필드 자체 생략 */ },
  "autoFix": { /* verdict=WARN이고 patch로 해결 가능할 때만, 그 외 생략 */
    "reason": "왜 이 patch가 점수를 올리는지",
    "patches": [
      { "path": "content.choices[2]", "before": "$3900$원", "after": "$3950$원" }
    ]
  },
  "askHuman": "verdict=FAIL일 때만, 사람의 판단이 필요한 이유 한국어로 1-2문장"
}
```

### score 산정 기준

| score | 의미 |
|:-:|:--|
| 9-10 | 본 차원에서 결함 없음. 학생 노출 가능. |
| 7-8  | 미세한 개선 여지. 보통은 그대로 통과 가능. |
| 5-6  | 명백한 결함 1개 이상. AUTO-FIX patch로 해결 가능하면 시도, 아니면 NEEDS_HUMAN. |
| 3-4  | 다수 결함 또는 구조적 결함. 재설계 권고. |
| 1-2  | 학생에게 노출되면 안 됨. REJECT. |

### verdict 매핑

- `score >= 8` → `PASS`
- `6 <= score < 8` → `WARN` (autoFix 권장; 없으면 NEEDS_HUMAN 처리)
- `score < 6` → `FAIL` (askHuman 사유 필수)

### AUTO-FIX 규칙

- **본 페르소나의 책임 범위 안에서만** patch 제안.
- `before` / `after`는 **원문 문자열을 그대로 인용**하고, 의미 동치이거나 명확한 개선이어야 함.
- 풀이 전체 재작성, 문제 자체 재설계는 AUTO-FIX 대상 아님 (askHuman).
- 의문 있을 땐 patch 제안하지 말고 `findings`만 채우고 verdict=WARN.

### axis 추론 규칙

- 본 페르소나가 추론 권한을 가진 axis만 `axisInferences`에 기록.
- 추론값에는 `confidence` (0~1) 포함 — 단서가 약하면 0.4~0.6, 명확하면 0.8+.
- 추론 근거를 `findings`에 `severity: "info"`로 함께 적기.

## 정직성 원칙

- 결함이 없으면 `findings: []`로 두고 score 9-10. 억지로 흠을 찾지 말 것.
- 결함을 발견했는데 본인 책임 범위 밖이면 `severity: "info"`로만 적고 score는 자기 차원만 본 점수.
- 한국어로 작성. 학생용 UI는 아니지만 검토 메시지도 한국어가 기본.
