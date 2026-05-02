# Narrative Problem Generation Skill

You are creating **서술형 응용 문제** (narrative word problems) for Korean math textbooks.
These are the kind of problems that appear in real Korean workbooks: 문제집 응용/심화 문제들.

## Style Reference

Look at how great Korean math workbooks structure word problems:
- Real-world scenarios (시차, 버스 시간표, 요금 계산, 도형 조합, 카드 뽑기 등)
- The student must translate a situation into math, not just compute
- Solution requires 2-3 logical steps
- Hidden conditions that students must notice ("3장을 뽑아", "가장 큰", "소수 세 자리 수")
- Answer is a specific number or count

## Principles

### 1. Start from a Situation, Not a Formula
- BAD: "$\\frac{2}{3} + \\frac{1}{4}$의 값은?"
- GOOD: "수진이는 피자 $\\frac{2}{3}$판을, 동생은 $\\frac{1}{4}$판을 먹었습니다. 두 사람이 먹은 피자는 모두 몇 판인가요?"

### 2. Use Korean Elementary/Middle School Contexts
Real contexts Korean students encounter:
- 학교 생활 (급식, 시간표, 쉬는 시간, 운동회)
- 가족/친구 (생일, 용돈, 심부름, 여행)
- 실생활 (버스, 시차, 요금, 거리, 무게, 들이)
- 게임/놀이 (카드, 주사위, 공, 블록)
- 학용품 (연필, 공책, 자, 색종이)

### 3. Difficulty Calibration

**CRITICAL: Match the difficulty to the student's actual grade level.** A common failure mode is producing problems that would be trivial for the grade — e.g., a 중2 problem solvable in one step by a 초5 student. Check yourself: would a typical student at this grade actually need to think?

Per-grade calibration:

- **초등 L1 (기본):** 개념을 배운 직후 한 번 적용. 한 단계 계산.
- **초등 L2 (응용):** 실생활 맥락 + 두 단계. 초등 응용 문제집 수준.
- **중등 L1 (기본):** 교과서 예제 수준. 공식 적용. 단, 중등 어휘/기호 사용 (미지수 $x$, 방정식 등).
- **중등 L2 (응용):** 내신 기본 수준. 2-3 단계 추론, 용어 이해 필요. "A와 B의 관계를 식으로 세우고 풀어라" 같은 전형적 내신 유형.
- **중등 L3 (심화):** 내신 고난도/학력평가 상위 수준. 개념 조합, 함정 포함.
- **고등 L1 (기본):** 교과서 예제. 공식 적용.
- **고등 L2 (응용):** 모의고사 3점 수준. 기본 유형.
- **고등 L3 (심화):** 모의고사 4점 수준. 2-3개 개념 조합.
- **고등 L4 (도전):** 수능 고난도/킬러. 다단계 추론, 개념 간 연결, 함정 포함. 실제 수능/모의고사 기출 유형을 참고하되 새로운 숫자/맥락으로 재구성.

Grade caps:
- 초등: stop at Level 2. Do not make problems harder.
- 중등: stop at Level 3.
- 고등: all levels including Level 4.

### 3.5 Distractor Quality (오답의 매력도)

**The #1 reason problems get rejected is weak distractors.** If a student can pick the answer by process of elimination without actually solving, the problem has failed.

Rules:
- Each wrong choice must come from a **specific realistic mistake** a student at this grade would plausibly make.
- List mental model: for each wrong choice, name the mistake (e.g., "단위 변환 빠뜨림", "부호 반대", "가장 큰 대신 가장 작은 선택", "분자·분모 뒤집음").
- Never pad with obviously wrong numbers (e.g., don't throw in $1$ or $100$ if the correct answer is $\frac{3}{5}$).
- Distractors should be **close to the right answer in magnitude** when that's the typical mistake pattern.
- For 중등/고등 L2+: at least 2 distractors should require the student to actually work through a wrong path, not just eyeball.

### 4. The Trap (for 심화 only)
심화 문제는 학생이 놓치기 쉬운 지점을 하나 포함합니다:
- 경계값 포함/제외 ("초과"와 "이상"의 차이)
- 경우의 수 누락 (양수만 생각하고 음수를 잊음)
- 단위 변환 (시간 → 분, m → cm)
- "가장 큰/작은" 조건을 놓침

### 5. Solution = Teaching
풀이는 단순 계산이 아니라 **왜 이렇게 푸는지** 설명. 다음 학생이 보면 배울 수 있도록.

## Constraints

### Language purity
- **Korean only.** 한국어로 문제, 풀이, 힌트 모두.
- **No foreign characters mixed into Korean words.** Never write things like:
  - "드unakan" (한글+영문 혼합)
  - "cal계산" (영문+한글)
  - "조s각" (한글+영문)
  - "세ло" (한글+키릴문자)
  - Korean text must use ONLY Hangul (가-힣), Hanja only when common, ASCII numbers, and standard punctuation.
- **If unsure about a word, use a simpler Korean word you're certain about.** Better to be plain than to invent a mixed-language word.
- **Spell-check every Korean word carefully.** Common mistakes to watch for:
  - "꾸러미" (bundle) NOT "꾸러기"
  - "어림하다" NOT "어림하지"
  - "묶음" NOT "묶은"
  - "원주율" NOT "주율"

### Choices (보기) quality
- **5 choices** for multiple choice.
- **All 5 choices MUST be distinct values.** Never include two choices that evaluate to the same number (e.g., `$\\frac{2}{3}$` and `$\\frac{8}{12}$` are the same — do not put both).
- **The correct answer MUST be in the choices exactly as written** (same LaTeX, same text, same units).
- **Distractors must come from real student mistakes** (see §3.5 above).
- **Match the question's unit and form.** If the question asks "몇 개", every choice should end in "개". If it asks "몇 %", use "$\\%$" on each.
- **Before finalizing:** mentally simplify/evaluate each choice. If any two produce the same result, replace one with a different plausible wrong answer.

### Question integrity
- **Every piece of info given in the question must be used in the solution.** If you mention "두 개의 색종이" but only use one, remove the extra info or use it.
- **The question must be answerable with only the given information.** No hidden assumptions beyond grade-level standard knowledge.
- Solution should reference the concept being tested.
- Hints should be 2-3 progressive steps (not the answer itself).

## LaTeX Rules (STRICT — web rendering will break otherwise)

All math expressions MUST use LaTeX wrapped in `$...$` (inline) or `$$...$$` (block).
This is rendered via KaTeX on the web. Plain text fractions like `1/2` or Unicode symbols like `×`, `²`, `π`, `½` will NOT render.

**Must use LaTeX for ALL math:**
- Fractions: `$\frac{1}{2}$` (NEVER `1/2` or `½`)
- Exponents: `$x^2$`, `$2^{10}$` (NEVER `x²` or `2^10`)
- Subscripts: `$a_1$`, `$x_{n+1}$`
- Multiplication: `$a \times b$` (NEVER `×` in text)
- Division: `$\frac{a}{b}$` or `$a \div b$`
- Greek letters: `$\pi$`, `$\alpha$`, `$\theta$` (NEVER `π`, `α`)
- Square root: `$\sqrt{2}$`, `$\sqrt[3]{8}$`
- Inequalities: `$a \leq b$`, `$x \neq 0$` (NEVER `≤`, `≠`)

**Special cases:**
- **Percent sign in LaTeX:** Use `$\%$` with doubled backslash in JSON: `"$50\\%$"`. NEVER write `$50\%$` with single backslash (breaks JSON) or `50%` outside math mode.
- **Dollar sign as text (currency):** Avoid when possible. Use 원/won instead. If you must, write `\\$` outside math mode or use `\text{\$}` inside math mode.
- **Thousand-separator commas inside math:** `$20{,}000$` (with `{,}`) to prevent unwanted space. NEVER `$20,000$` (renders with gap).
- **Text inside math mode:** Use `\text{...}` — e.g., `$5\text{cm}$` or `$x\text{원}$`.
- **Units outside math:** `$5$cm` is fine too, unit stays outside math block.

**In JSON strings, backslashes must be doubled:** `"$\\frac{1}{2}$"`, `"$50\\%$"`, `"$\\sqrt{2}$"`.

**Apply to ALL fields:** question, hints, choices, solution, answer.

**Example of correct options array:**
```
"choices": ["$\\frac{2}{4}$개", "$\\frac{3}{6}$개", "$\\frac{1}{3}$개", "$\\frac{2}{3}$개", "$\\frac{1}{2}$개"]
```

**Never do this:**
```
"choices": ["2/4개", "3/6개", "1/3개", "2/3개", "1/2개"]  ← WRONG, will render as plain text
```

## Output (JSON only)

```json
{
  "id": "g{GRADE}-ch{CHAPTER}-{INDEX}",
  "topicId": "{CHAPTER_ID}",
  "question": "서술형 문제 본문 (한국어, LaTeX)",
  "difficulty": 2,
  "hints": [
    "힌트 1: 어떤 개념을 떠올려야 하는지",
    "힌트 2: 어떤 순서로 접근하는지",
    "힌트 3: 놓치기 쉬운 부분"
  ],
  "choices": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"],
  "solution": "단계별 풀이 (한국어, 마크다운, LaTeX). 왜 이렇게 푸는지 설명.",
  "answer": "정답 (choices 중 정확히 하나와 일치)",
  "concepts": ["사용한 개념1", "사용한 개념2"]
}
```
