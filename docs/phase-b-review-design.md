# Phase B — Multi-Persona Review Board Design

> Status: **proposal v0.1** (2026-05-05). Detailed system design for the
> 6-persona content review board introduced in
> `docs/curriculum-ssot-design.md` (v0.3 §9). To be approved before any
> code is written.

## 1. 목적과 비-목적

### 목적
- 241개 curated problem (그리고 향후 신규 생성)에 대해 **6개의 직교 차원에서 자동 검증** → 학생에게 노출되기 전 품질 게이트
- 기존 `validate-problems.py` 단일 점수(quality/format/korean)를 넘어, **무엇이 약한지 차원별로 보고**
- Phase A의 axes 3개(`difficulty.orthogonal_concepts`, `difficulty.combination_mode`, `cognitive.misconception_tag`)를 **검증 과정에서 자동 추론·기록** — 별도 axis inference 패스 불필요

### 비-목적
- ❌ Lesson 검증 — Phase B는 problem만
- ❌ start-workflow의 plan.json / dispatch_profile / agent.yaml 인프라 도입
- ❌ 6 페르소나가 서로 토론(debate) — 각자 독립 평가, 결과를 점수로 합산
- ❌ Self-improving 페르소나 — prompt 진화는 사람이 PR로 결정
- ❌ Lesson/student-memory 검증 — 후속 phase

## 2. 6 페르소나 책임 매트릭스

| Persona | 검증 영역 | 자동 axis 추론 | AUTO-FIX 권한 | ASK-HUMAN 트리거 |
|:--|:--|:--|:--|:--|
| **수학 정확성** (math-correctness) | 답·풀이가 수학적으로 정확. 보기 중복 없음. 풀이 논리 정합. LaTeX 정합. | (없음) | 단순 계산 오류 한 곳 수정 | 풀이 전체 논리 결함, 답 자체가 틀림 |
| **학년 적합성** (grade-appropriateness) | 어휘·개념·문장 길이가 학년 교육과정 안. 직역체 없음. | `cognitive.misconception_tag` (학년에 흔한 오개념 식별) | 한자어/외래어 → 우리말, 어색한 직역 다듬기 | 개념이 학년 범위 밖, 챕터 매핑 자체가 틀림 |
| **함정 품질** (trap-quality) | 의도한 함정이 난이도를 결정 (vs 단순 계산복잡도). 오답 보기가 그럴듯한 함정. | `difficulty.combination_mode` | 약한 오답 → 함정성 강화 | 함정 부재로 단순 암기 문제 — 재설계 필요 |
| **한국어 자연스러움** (korean-naturalness) | 한국 학생 일상어. 직역체·기계어 없음. 존댓말/반말 일관성. | (없음) | 어색한 문장 다듬기 | 문맥 자체가 한국 학생에게 어색 (예: 외국 통화/단위) |
| **풀이 가능성** (solvability) | 자력 풀이 단서 충분. 힌트가 단계적. 선행지식 가정 명확. | `difficulty.orthogonal_concepts` | 힌트 1-2 보강 | 단서 자체 부족 — 재설계 |
| **교육과정 정합성** (curriculum-alignment) | L1 chapter.concepts와 정렬. content.concepts 태그 정확. 다른 단원 개념 침범 X. | `cognitive.misconception_tag` (이 챕터의 표준 오개념) | concepts 태그 보정 | 챕터 매핑 자체가 틀림 |

**axis 추론 분담 원칙:** 각 axis는 자연스럽게 가장 잘 평가할 수 있는 1-2개 페르소나가 추론. 여러 페르소나가 같은 axis를 추론하면 confidence 가중평균.

## 3. 입력/출력 schema

### 페르소나 입력
```typescript
interface PersonaInput {
  problem: ProblemV2;          // axes 미추론 상태에서 호출됨
  chapter: {                    // L1 curriculum context
    grade: number;
    subject: "math" | "science";
    chapterTitle: string;
    concepts: string[];
    semesterTitle: string;
  };
  prerequisites?: Prerequisite[];  // L2 lesson에서 derive
  attempt: number;              // 1=initial, 2~3=fix-loop iteration
  previousFindings?: PersonaOutput;  // attempt>1일 때 직전 결과
}
```

### 페르소나 출력 (JSON 강제)
```typescript
interface PersonaOutput {
  persona: PersonaName;
  score: number;                       // 1-10
  verdict: "PASS" | "WARN" | "FAIL";
  findings: Finding[];
  axisInferences?: Partial<ProblemAxes>;  // 이 페르소나가 추론한 axis (있을 때만)
  autoFix?: AutoFixProposal;           // verdict=WARN이고 자동수정 가능할 때
  askHuman?: string;                    // verdict=FAIL일 때 사유
}

interface Finding {
  severity: "info" | "warn" | "critical";
  field: string;        // "content.solution", "content.choices[2]", "axes.combination_mode" 등
  message: string;      // 한국어 자연어
  suggestion?: string;
}

interface AutoFixProposal {
  reason: string;
  patches: { path: string; before: string; after: string }[];
}
```

### Score Gate 결정
```
final_score = min(persona.score for persona in 6)   // 가장 약한 차원이 결정

if final_score >= 8: status = PASS, axes 추론 결과 confidence 가중평균으로 기록
elif final_score >= 6: status = REVISE
   → autoFix 모은 후 generate-problem 재호출(또는 직접 patch 적용)
   → 최대 3회 fix-loop, 미달 시 status = NEEDS_HUMAN
elif final_score >= 4: status = NEEDS_HUMAN  (autoFix로 해결 안 될 가능성 높음)
else: status = REJECT  (학생 노출 차단)
```

## 4. Fix Loop 흐름

```
[draft problem]
   │
   ▼
[Round 1: 6 페르소나 병렬 호출]
   │
   ├─ all PASS → finalize, write validation + axes ──► DONE (PASS)
   │
   ├─ min < 4 → REJECT, write validation block ────► DONE (REJECT)
   │
   ├─ min < 6 → NEEDS_HUMAN ─────────────────────────► DONE (NEEDS_HUMAN)
   │
   └─ 6 ≤ min < 8:
        Aggregate AutoFix proposals from WARN personas
              │
              ├─ 모두 patch 형식 → 직접 patch 적용 + Round 2 검증
              │
              └─ 일부 prompt 형식 → generate-problem 재호출 with critique 요약
                  → 새 draft → Round 2 검증
                       │
                       └─ Round 2가 또 WARN이면 Round 3 시도
                            → 여전히 미달이면 status = NEEDS_HUMAN
```

**핵심 결정:**
- **Round 1만 진정 병렬.** Round 2~3은 모두 페르소나가 다시 평가하지만 patch는 단일 author(별도 "fix-author" 페르소나 또는 generate-problem 재호출).
- **Patch vs Regenerate 선택**: AutoFix 출력이 모두 `patches[]` 형식이면 직접 patch (싸고 빠름). 누군가 "재설계" 요구하면 generate-problem 재호출.
- **Stop condition**: 3회 또는 score 단조 증가 X (oscillation 감지) 시 NEEDS_HUMAN 강제 종료.

## 5. CLI 인터페이스

```bash
# 단일 문제
python3 scripts/review-problem.py g7s1-ch1-01

# 학년 일괄
python3 scripts/review-problem.py --grade 7

# 학년 + 학기
python3 scripts/review-problem.py --grade 7 --semester 1

# 모든 UNCHECKED만
python3 scripts/review-problem.py --status UNCHECKED

# Dry-run (validation 블록 안 씀, 콘솔 보고만)
python3 scripts/review-problem.py g7s1-ch1-01 --dry-run

# Fix-loop 비활성 (1라운드만)
python3 scripts/review-problem.py g7s1-ch1-01 --no-fix-loop

# 페르소나 일부만 (디버깅)
python3 scripts/review-problem.py g7s1-ch1-01 --personas math-correctness,solvability
```

## 6. 모델 선택 전략

| Persona | 모델 | 근거 |
|:--|:-:|:--|
| math-correctness | opus | 풀이 논리 정합성은 reasoning-heavy. haiku는 미묘한 풀이 오류 놓침. |
| grade-appropriateness | sonnet | 어휘·문장 판정. opus 과잉. |
| trap-quality | opus | 함정 설계는 메타인지 — opus 강점. |
| korean-naturalness | haiku | 단순 한국어 자연스러움. fast. |
| solvability | sonnet | 단서 분석. 중간 난이도. |
| curriculum-alignment | sonnet | 챕터 concepts 매칭. enum 검사 가까움. |

**비용 추정**: 1 problem당 평균 2-3 opus + 3-4 sonnet/haiku. 241 problem × 평균 1.5 라운드 = 약 1,800 호출. 비용은 opus 비중에 따라 달라지나 일회성. (start-workflow의 6 personas all-opus 패턴은 비용 부담 큼 — 차원에 맞춰 분산.)

## 7. 병렬성 + Concurrency

- Python `asyncio` + `claude` CLI subprocess (TS와 같은 방식)
- 페르소나당 별도 subprocess. 6개 동시. CLI cold-start 6회는 어쩔 수 없음 (~3-5s overhead).
- **cwd 격리**: claude.ts에서 적용한 패턴 그대로 — `cwd=/tmp`로 spawn해 forming의 CLAUDE.md auto-load 방지.
- 학년 일괄 시 외부 throttle: 동시에 몇 problem 처리할지 (`--concurrency 4` 기본).

## 8. Lesson context 통합

각 페르소나 prompt에 자동 주입:
- L1 chapter.concepts (curriculum-alignment 필수)
- L2 lesson의 prerequisites (solvability — 선행지식 가정 검증)
- L2 lesson의 explanation (curriculum-alignment — 표준 어휘 추출)

→ 페르소나가 학생이 받는 컨텐츠 전체 맥락에서 문제를 평가.

## 9. 재현성 / 추적

- Prompt versioning: 페르소나 prompt를 `src/data/prompts/review/{persona}.md`로 분리. validation block의 `prompt_versions: { math_correctness: "math-correctness.md@<sha>" }`에 hash 기록.
- Temperature 0.3 (default 1.0보다 낮춤) — 페르소나 평가 분산 줄임. axis inference도 안정.
- 모든 호출은 기존 ai_call.jsonl에 logCtx 포함 자동 기록 (Phase A 인프라 그대로 사용).

## 10. Validation block 매핑

```jsonc
"validation": {
  "status": "PASS",
  "scores": {
    "math_correctness": 9,
    "grade_appropriateness": 8,
    "trap_quality": 7,
    "korean_naturalness": 9,
    "solvability": 8,
    "curriculum_alignment": 9
  },
  "verdict_at": "2026-05-06T...",
  "validator_model": "opus+sonnet+haiku",      // 혼합 표시
  "rounds": 1,                                  // fix-loop 라운드 수
  "report_ref": "validation-reports/g7s1-ch1-01.json",
  "prompt_versions": {                          // 재현성
    "math_correctness": "math-correctness.md@a1b2c3d",
    ...
  }
}
```

`validation-reports/g7s1-ch1-01.json`에 raw 6 페르소나 응답 + axisInferences merge log + fix-loop history 보관 (projection, NOT SSoT).

## 11. Phase B 실행 단계

1. **B.0 (반나절)** — 페르소나 prompt 6개 작성. `src/data/prompts/review/*.md`. 단일 문제로 수동 테스트.
2. **B.1 (1일)** — `scripts/review-problem.py` 골격: 단일 문제, 직렬 호출, 결과 콘솔 출력. (병렬·fix-loop X)
3. **B.2 (1일)** — 병렬 호출 (asyncio) + score gate 로직.
4. **B.3 (1일)** — Fix-loop (patch 적용 + regenerate 재호출). validation block in-place 업데이트.
5. **B.4 (반일)** — Batch 모드 (`--grade`, `--semester`, `--status`). throttling.
6. **B.5 (반일)** — Axis inference merge. validation-reports projection 생성.
7. **B.6 (반일)** — 학년 1개(g7) 전체 batch + 결과 분석. promp tuning.

총 4-5일.

## 12. 종료 기준

- [ ] 페르소나 prompt 6개 commit + 단일 문제 테스트 통과
- [ ] `scripts/review-problem.py {id}` 동작 (1 라운드, 6 페르소나 병렬)
- [ ] Fix-loop 1회 이상 동작 확인 (WARN → autoFix → PASS)
- [ ] 학년 1개(예: g7) batch 통과 — 모든 문제에 validation 블록 채워짐
- [ ] axes 3개 자동 추론 — `bun scripts/query-axis.ts --axis difficulty.combination_mode --value chain` 결과 N>0
- [ ] 운영 검증: `validation.status === "REJECT"`인 문제는 학생에게 노출 안 됨 (Phase A에서 이미 구현)

## 13. 결정 사항 (2026-05-18 확정)

| # | 항목 | 결정 |
|:-:|:--|:--|
| 1 | Patch 형식 | Custom `{path, before, after}` (LLM-friendly) |
| 2 | Fix-loop regenerate 경로 | `scripts/generate-problems.py` Python 함수 직접 호출 |
| 3 | Temperature | 0.3 (안정 우선) |
| 4 | `--concurrency` 기본값 | 4 (이후 throughput 보고 상향 조정) |
| 5 | validation-reports 보관 | 영구 (작은 JSON, git 보관) |
| 6 | Round 2 점수 < Round 1 | Round 1 결과로 revert |

B.0 착수.
