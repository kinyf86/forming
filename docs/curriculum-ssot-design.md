# Curriculum SSoT — Design

> Status: **proposal v0.3** (2026-05-02). Forming-native rewrite — keeps
> only the borrowed concepts that match Forming's telos (개인화된 학생
> 학습 경험), strips infrastructure that solves start-workflow's telos
> (multi-agent SWE traceability) but not ours. Axis count reduced from
> 9 → 3 with explicit extension hooks.

## 0. Changelog

- **v0.3 (2026-05-02)** — Forming-telos rewrite. Axis 9→3, source 4→2,
  removed projections.yaml (YAGNI), simplified Phase D distill gate
  (R1~R4 → 2-line filter), Phase A shortened 2-3d → 1.5-2d. Borrowed
  concepts re-evaluated against Forming's "학생 학습 효과" telos rather
  than start-workflow's "감사용 traceability" telos.
- **v0.2 (2026-05-02)** — Central dimension registry + projection model;
  Phase D added.
- **v0.1 (2026-05-02)** — Initial 4-layer SSoT, schema v2 flat blocks.

## 1. Telos가 다르다 — 이게 모든 것을 결정함

| 차원 | start-workflow telos | Forming telos |
|:--|:--|:--|
| 목적 | AI agent 추론이 컨텍스트 경계를 넘어 **검증·추적·지속** | 학생이 AI에게 **개인화된 학습 경험** |
| 산출물 | traceability 자체 (감사용) | 학생 학습 효과 (간접 측정) |
| 사용자 | 다중 SWE/QA/Process 엔지니어 | 단일 운영자(나) + 다수 K-12 학생 |
| Confidence 의미 | trace evidence — 감사 일급 시민 | decay/staleness 시그널만 |
| Source tracking | 입력 문서 라인 단위 (감사 필수) | human/AI 구분만 충분 |
| Memory 의미 | 다음 세션 엔지니어에게 결정 근거 | 다음 튜터 세션이 학생을 더 안다 |
| Governance | T0~T3 + R1~R4 (다중 작성자 충돌 방지) | 거의 불필요 (1인 운영) |
| Schema rigidity | strict + versioned (trace 보장) | 학습 효과만 측정되면 진화 자유 |

이 차이가 v0.2의 일부 결정을 over-engineering으로 만듭니다 — 9 axis,
projection.yaml, R1~R4 rubric은 모두 multi-agent traceability telos의
산물. v0.3은 Forming telos에 맞게 minimal하게 재정의.

## 2. 즉시 가치 2개 (이게 전부)

다른 것은 부수효과. 이 둘에 직결되지 않으면 안 가져옴.

1. **Phase B 컨텐츠 품질 게이트** — 6 페르소나 review가 axis-aware로
   동작하면 어떤 차원에서 약한지 보고. 학생이 받는 컨텐츠 질이 올라감.
2. **Phase D 학생 개인화** — 학생별 학습 패턴이 axis-grounded memory로
   누적 → 다음 튜터 세션 system prompt에 자동 주입. Forming의 본질적
   moat.

이 2개 가치를 가능하게 하는 **최소** 데이터 모델만 만든다.

## 3. 빌리는 것 / 버리는 것

### 빌리는 것 (Forming telos 정합)

| 패턴 | 이유 |
|:--|:--|
| Multi-perspective review board (6 페르소나) | 컨텐츠 품질 = 학생 학습 효과 직결 ★ |
| Distill → memory injection | 학생 개인화 = Forming 본질 ★★ |
| Time-decay mechanism | 학생은 빠르게 성장 — stale memory 방지 ★ |
| Axis registry 개념 (3개로 축소) | Cross-cut query 가능 (chain 약한 학생, chain 문제 부족 학년) ★ |
| 6개월 사용률 retro로 prune/추가 | 가벼운 governance ★ |

### 버리는 것 (telos 미스매치 또는 over-engineered)

| 패턴 | 이유 |
|:--|:--|
| 9V dimension schema 그대로 | 168 field 스캔 후 도출된 자동차 도메인 산물 |
| `(value, source, confidence)` 모든 field 적용 | Forming은 AI-inferred axis에만 의미 |
| `projections.yaml` | YAGNI — axis 3개에 불필요. Zod schema의 required/optional로 충분 |
| 4-source 분류 (deterministic/ai_semantic/human_curated/derived) | Forming은 2종(`ai`/`human`)으로 충분 |
| R1~R4 rubric | 1인 운영, 다중 작성자 충돌 없음 |
| start-workflow `serves_decision` 형식 | 가벼운 1-line으로 충분 |
| harness-orchestrate / plan.json / dispatch_profile / agent.yaml | 인프라 telos 미스매치 |
| ASPICE 5-stage pipeline | 역방향(reverse engineering) 인프라 — Forming은 forward 생성 |
| Iron Laws 5개 | 컴플라이언스 도메인 산물 |
| V10+ AI-extensible registry | Governance 부재로 noise axis 위험. 6개월 retro 후 결정 |

## 4. SSoT 5-Layer Model

```
L1  curriculum/       Human-edited (학년/학기/챕터/개념 트리)
                      파일: src/data/curriculum/grade{N}-{subject}.json

L2  lessons/          AI-generated (챕터별 개념 설명 + 확인문제)
                      파일: src/data/lessons/{subject}-{N}-{S}-{C}.json

L3  problems/         AI-generated (학습 문제) — 새 위치
                      파일: src/data/problems/{grade}s{sem}-ch{N}-{seq}.json

L4  submissions/      Runtime (학생 풀이 + AI 분석 + 후속 대화)
                      파일: src/data/history/{clientId}_{type}.jsonl

L5  student_memory/   Distilled student profile (Phase D에서 채움)
                      파일: src/data/student-memory/{clientId}/{topic}.md

projection (NOT SSoT):
    src/data/validation-reports/        ← Phase B로 axis-aware 확장
    src/data/generated/gen-*.json       ← 런타임 ad-hoc 캐시
```

기존에 grade/subject/chapter는 파일명 prefix + topicId에 deterministic으로
존재 — **별도 axis 블록 만들지 않음**. 중복 메타데이터 회피.

## 5. Minimum Viable Axis Set (3개)

`config/dimensions/registry.yaml`:

```yaml
schema: forming-dimension-registry/0.1
description: |
  Minimum viable axis set. 3 axes inferred by AI, used by Phase B
  validation and Phase D student memory cross-cut. Extension policy:
  retro every 6 months OR when 3+ add requests accumulate.

axes:
  difficulty.orthogonal_concepts:
    type: int
    range: [1, 5]
    description: "독립 개념 축의 갯수. 축 1개=Level1, 2개=Level2, 3+개=Level3+"
    inferred_by: ai
    used_by:
      - phase_b_review.solvability_persona
      - phase_d_student_memory  # 학생이 어느 axis에서 약한지

  difficulty.combination_mode:
    type: str
    enum: [single, parallel, chain, mixed]
    description: |
      single: 1개 개념. parallel: 독립 병렬. chain: A→B→C 연쇄.
      mixed: 병렬+연쇄 혼합. 초등은 chain까지만, 중등 이상 mixed 허용.
    inferred_by: ai
    used_by:
      - phase_b_review.trap_persona
      - phase_d_student_memory

  cognitive.misconception_tag:
    type: list[str]
    description: |
      open vocabulary. 이 문제가 노출하려는 (또는 학생이 보유한) 오개념
      패턴. 예: "even_number_is_not_prime", "sign_loss_in_subtraction".
      Phase D student memory와 problem이 cross-link되는 핵심 axis.
    inferred_by: ai
    used_by:
      - phase_b_review.curriculum_persona
      - phase_d_student_memory  # ★ Phase D 핵심
```

**왜 이 3개만:**

| Axis | 이게 없으면 잃는 것 |
|:--|:--|
| `difficulty.orthogonal_concepts` | Forming의 본질적 분석 모델 — prompt에 prose로만 있던 걸 structured화. Phase B 풀이 가능성 검증의 근거 |
| `difficulty.combination_mode` | 함정 품질 검증, 학생 chain 추론 약점 식별 |
| `cognitive.misconception_tag` | **Phase D 전체의 grounding**. 이게 없으면 student memory가 prose만 되어 cross-query 불가능 |

**왜 다른 axis는 빼는가:**

| 빠진 axis (v0.2에서) | 이유 |
|:--|:--|
| `meta.grade`, `meta.subject`, `meta.chapter_path` | 파일 prefix + topicId에 이미 있음. 중복 |
| `difficulty.trap_types` | Phase B 6 페르소나가 정착 후 추가 평가. 지금은 prompt prose로 충분 |
| `mastery.confidence`, `mastery.last_evidence_at` | Phase D 시작 시 그때 추가 |

### 5.1 확장 hook (governance)
- 새 axis 추가 신청은 issue/PR로 누적
- 3건 이상 또는 6개월 경과 시 retro → batch 추가
- 사용률 < 5% axis는 retro에서 prune
- V10+ AI-extensible은 비활성

### 5.2 Source 분류 (단순화)
- `ai` — AI 추론 (confidence 의미 있음)
- `human` — 운영자 수정/승인 (confidence 항상 1.0, 표시만)
- deterministic/derived는 코드로 명백 → field 불필요

### 5.3 Confidence 의미
- AI-inferred axis에만. range [0.0, 1.0]
- decay 대상 (Phase D)
- 감사용 X — 데이터 신뢰도 시그널만

## 6. Schema v2 — 최소 형태

### 6.1 Problem (`src/data/problems/{id}.json`)

```jsonc
{
  "schema": "forming-problem/2.0",
  "id": "g7s1-ch1-01",
  "topicId": "math-7-1-01",       // grade/subject/chapter는 여기서 derive

  "axes": {
    "difficulty.orthogonal_concepts": {"value": 1, "source": "ai", "confidence": 0.9},
    "difficulty.combination_mode": {"value": "single", "source": "ai", "confidence": 0.95},
    "cognitive.misconception_tag": {
      "value": ["even_number_is_not_prime"],
      "source": "ai",
      "confidence": 0.7
    }
  },

  "content": {                     // 기존 schema 유지 (rename만)
    "question": "...",
    "hints": [...],
    "choices": [...],
    "solution": "...",
    "answer": "$10$",
    "concepts": ["소수", "합성수"]
  },

  "provenance": {
    "source_model": "opus",
    "generated_at": "2026-04-22T10:15:33Z",
    "generator": "generate-problems.py",
    "prompt_version": "generate-problem.md@f6138fa"
  },

  "validation": {
    "status": "PASS",                // PASS | REVISE | REJECT | NEEDS_HUMAN | UNCHECKED
    "scores": {                       // Phase B 6 페르소나
      "math_correctness": 9,
      "grade_appropriateness": 8,
      "trap_quality": 7,
      "korean_naturalness": 9,
      "solvability": 8,
      "curriculum_alignment": 9
    },
    "verdict_at": "2026-04-23T01:02:11Z",
    "validator_model": "opus",
    "report_ref": "validation-reports/g7s1-ch1-01.json"
  }
}
```

### 6.2 Lesson — `provenance` + `validation` 블록만 추가. `axes`는 일단
없음 (Phase B에서 lesson 검증 시작하면 추가). 본문 schema 그대로.

### 6.3 Curriculum — 변경 없음. `provenance.source_model: "human"`만 추가
가능하나 git history로 충분 → **변경 없음**.

### 6.4 StudentMemory (`src/data/student-memory/{clientId}/{topic}.md`)

```markdown
---
schema: forming-student-memory/0.1
clientId: <hashed>
topic: misconception/even-number-is-not-prime
axes:
  cognitive.misconception_tag:
    value: [even_number_is_not_prime]
    source: ai
    confidence: 0.85
  difficulty.combination_mode:
    value: single  # 이 misconception이 관찰된 문제의 mode
    source: ai
    confidence: 0.9
mastery:
  confidence: 0.3                   # 학생의 이 axis에 대한 숙련도
  last_evidence_at: 2026-05-01T14:22:11Z
  evidence_count: 2
first_observed: 2026-04-28
serves: |
  다음 튜터 세션에서 소수 개념 설명 시 "2는 짝수이지만 소수"를 먼저 강조
cites:
  - history/{clientId}_conversation.jsonl#turn-2026-04-28T...
  - problems/g7s1-ch1-01.json
---

학생은 g7s1-ch1-01에서 "2는 짝수이므로 소수가 아니다"라고 답함.
follow-up Q&A에서 같은 패턴 1회 더 관찰됨...
```

`mastery.confidence` / `mastery.last_evidence_at` / `evidence_count`는
student_memory entity에서만 의미 있음 → axis registry 등록 불필요. memory
schema에 직접 포함.

## 7. Roadmap

| Phase | 내용 | 기간 | 산출물 |
|:--|:--|:--|:--|
| **C** ✅ | 본 설계문서 v0.3 | 반나절 | `docs/curriculum-ssot-design.md` |
| **A** | Axis 3개 + 5-layer SSoT 정리 + schema v2 마이그레이션 | **1.5-2일** | `config/dimensions/registry.yaml`, `src/data/problems/`, migrate script, Zod schemas |
| **B** | 6 페르소나 review board (axis-aware) | 3-5일 | `scripts/review-problem.py`, prompts 6개, fix loop |
| **C2** | Privacy/Eval RFC (Phase D 게이트) | 반나절 | `docs/student-memory-privacy.md`, `docs/student-memory-eval.md` |
| **D** | Student retro + distill + memory injection | 5-7일 | `scripts/student-retro.ts`, `scripts/student-distill.ts`, tutor/chat prompt 통합 |

## 8. Phase A — 실행 안 (1.5-2일)

### A.1 Dimension Registry (~1시간)
- `config/dimensions/registry.yaml` — §5 axis 3개
- `src/lib/dimensions.ts` — TypeScript 타입 + Zod schema (yaml 로드 +
  validate). projection.yaml 없음 — entity Zod schema에서 직접 표현.

### A.2 디렉토리 재구성 (~30분)
- `src/data/problems/` 신설
- `src/data/generated/g*.json` → `git mv`로 이동 (history 보존)
- `src/data/student-memory/` 신설 (Phase D에서 채움)
- `src/lib/problems.ts` 신설 — `getProblem(id)` / `listProblems()` 등
- 호출처 업데이트 (`src/app/api/generate-problem/route.ts`,
  `src/app/result/[submissionId]/page.tsx` 등)

### A.3 Schema v2 (~1시간)
- `src/lib/schemas/problem.ts` — Zod schema, axes/provenance/validation
  포함
- `src/lib/schemas/lesson.ts` — provenance/validation만 추가, axes 없음
- StudentMemory schema는 Phase D로 미룸

### A.4 마이그레이션 스크립트 (~3시간)
- `scripts/migrate-to-v2.py`:
  - 기존 problem JSON → axes 블록 채움 (Opus 호출로 3 axis 추론)
  - `provenance` 채움 (mtime + git log + 파일 prefix로 source_model 추론;
    `g{N}s{M}-` prefix → 배치 생성, `gen-` prefix → 런타임)
  - `validation` 채움 (validation-reports/ cross-ref; 없으면 UNCHECKED)
- Dry-run 모드 → diff 검토 → commit

### A.5 Validator schema-aware (~1시간)
- `scripts/validate-problems.py`가 v2 schema 인식
- 검증 후 problem JSON의 `validation` 블록 in-place 업데이트
- `validation-reports/`는 raw report만 (projection)

### A.6 사용처 업데이트 (~1시간)
- 런타임 problem 로드 시 v2 schema 검증 (Zod parse)
- `validation.status === "REJECT"`는 학생에게 미노출
- axis-grounded query 1개 시연: `bun scripts/query-axis.ts --axis difficulty.combination_mode --value chain --grade 7`

### A 종료 기준
- [ ] 모든 problem JSON v2 schema 통과
- [ ] `bun run typecheck` 통과
- [ ] 학생 UX 회귀 없음
- [ ] `config/dimensions/registry.yaml` 작동
- [ ] axis-grounded query 1개 시연

## 9. Phase B — 실행 안 (3-5일)

### B.1 6 페르소나 (axis-aware)

| Persona | 검증 차원 | 관련 axis (v0.3) |
|:--|:--|:--|
| 수학 정확성 검증자 | 답·풀이 정합성, 보기 중복 | (없음) |
| 학년 적합성 검증자 | 어휘/개념이 학년 범위 안 | cognitive.misconception_tag |
| 함정 품질 검증자 | 의도한 함정이 난이도 결정 | difficulty.combination_mode |
| 한국어 자연스러움 검증자 | 자연스러운 한국어 | (없음) |
| 풀이 가능성 검증자 | 자력 풀이 단서 충분 | difficulty.orthogonal_concepts |
| 교육과정 정합성 검증자 | L1 chapter.concepts 정렬 | cognitive.misconception_tag |

각 페르소나는 자기 axis의 추론을 **수정 제안 가능**.

### B.2 병렬 디스패치 + Score Gate
- `scripts/review-problem.py {id}` — 6 페르소나 병렬 (asyncio + lib/llm.py)
- Score gate: ≥8 AUTO-PASS / 6~7 WARN+autofix / <6 REJECT
- min_score 6~7 → fix loop 최대 3회 → 미달 시 NEEDS_HUMAN

### B.3 Batch + 회귀
- `--all-grade 7` 학년별 일괄
- `validation-reports/` v2 형식 재생성

### B 종료 기준
- [ ] 6 프롬프트 작성 + commit
- [ ] 단일 problem fix loop 1회 이상 동작
- [ ] 학년 1개 이상 batch review 완료

## 10. Phase C2 — 게이트 RFC (반나절)

Phase D 진입 전 사용자 승인 필수.

### C2.1 `docs/student-memory-privacy.md`
- 학생 데이터 영속 저장 권한/동의/삭제권
- clientId 익명화 정책 (현재 localStorage UUID 충분한가)
- 메모리 export/delete API 필요 여부
- 한국 미성년자 데이터 정책 검토

### C2.2 `docs/student-memory-eval.md`
- "메모리 주입이 학습효과 증가" 측정 방법
- A/B 분기 인프라 — submission outcome 비교
- false-positive memory의 self-fulfilling prophecy 영향 측정
- staleness/decay parameter 초기값

## 11. Phase D — 실행 안 (5-7일)

### D.1 추가 axis (memory schema에만 — registry는 X)
- `mastery.confidence`, `mastery.last_evidence_at`, `evidence_count`
- StudentMemory frontmatter에만 직접 포함 (cross-entity 아님)

### D.2 Student Retro (`scripts/student-retro.ts`)
- Sonnet xhigh로 충분 (Opus는 비용 과잉)
- 입력: 학생별 최근 N 세션 conversation/ai_call jsonl + 관련 problem JSON
  (axes 포함)
- 출력: 후보 인사이트 list (axis-grounded)

### D.3 2-line filter (R1~R4 대신)
인사이트 → memory 승격 게이트:
1. **axis-grounded인가** — registry axis 1개 이상에 매핑되는가? No → 드롭
2. **serves가 채워지는가** — "다음 튜터 세션 어떤 결정을 돕는가" 1-line이
   AI에 의해 자연스럽게 작성되는가? No → 드롭

start-workflow의 R1~R4 rubric은 다중 작성자 메모리 풀 오염 방지용.
Forming은 1인 운영 + AI 자동 캡처 → 2-line으로 충분.

### D.4 Distill (`scripts/student-distill.ts`)
- 후보 → §6.4 markdown memory 파일
- 같은 topic 존재 시 update (mastery.confidence 누적, evidence 갱신)

### D.5 Time-decay
- `mastery.last_evidence_at` N일 경과 → confidence 감쇠
- 같은 axis가 N회 이상 일관 관찰 → decay 계수 ↓ ("validated 4× longer"
  pattern)
- confidence < 0.2 → archive (audit 후 삭제)

### D.6 Memory Injection
- `src/lib/student-memory.ts` — clientId로 memory 로드, top-N 선정
- 튜터/피드백 chat system prompt에 자동 주입:
  ```
  ## 이 학생에 대해 (system, axis-grounded):
  - 소수 단원: "2는 소수 아님" 오개념 (mastery.confidence=0.3, 관찰 2026-04-28)
  - chain 추론에서 중간 단계 누락 (mastery.confidence=0.4, 관찰 2026-04-30)
  ```

### D.7 Eval (C2.2 인프라)
- A/B 분기 outcome 추적
- 4주 후 retro: 메모리 주입 vs 미주입 학습 outcome 비교

### D 종료 기준
- [ ] 학생 1명 이상 axis-grounded memory 자동 생성
- [ ] 튜터 세션 system prompt에 memory 주입
- [ ] decay 1회 이상 동작 확인
- [ ] C2.2 A/B 분기 작동

## 12. 비-목표 (모든 phase)

- ❌ harness-orchestrate / workflow-plan / plan.json
- ❌ ASPICE 5-stage pipeline, dispatch_profile, agent.yaml validator
- ❌ V10+ AI-extensible registry (6개월 retro 후)
- ❌ Plan Gate를 학생 대면 UX
- ❌ Lesson 자동 검증 (Phase B는 problem만)
- ❌ Submission(L4) jsonl format 변경

## 13. 미결사항 (Phase A 시작 전 결정 — v0.2에서 1개 줄음)

1. **`gen-{hash}.json` / `rec-{hash}.json` 런타임 캐시** — 유지 vs gitignore?
2. **Schema 마이그레이션 시 git history 보존** — `git mv` (강력 권장) vs
   평범한 mv?
3. **Registry yaml 위치** — `config/dimensions/` (start-workflow 패턴) vs
   `src/data/dimensions/` (Forming 패턴)?

(v0.2의 미결 #3 "axis 9개 적절한가"는 v0.3에서 3개로 결정 — 닫힘.)

이 3개에 답 주시면 Phase A 시작.
