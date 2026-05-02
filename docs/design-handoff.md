# Forming 디자인 핸드오프 가이드

Claude Design(claude.ai) ↔ Claude Code(이 터미널) 워크플로우.

---

## Step 1 — claude.ai에서 Claude Design 세션 시작

1. [claude.ai](https://claude.ai) 로그인 (Pro/Max/Team/Enterprise 필요)
2. 신규 기능 **"Design"** 또는 **"Claude Design"** 엔트리 선택 (좌측 사이드바 / 상단 메뉴)
   - Research Preview 단계이므로 위치는 UI 업데이트에 따라 달라질 수 있음
3. 새 디자인 세션 생성 → 프로젝트명: **"Forming 디자인 개선 v1"**

## Step 2 — 브리프 전달

다음 파일을 그대로 복사해서 첫 메시지로 붙여넣기:

```
.context/claude-design-brief.md
```

또는 터미널에서:

```bash
cat .context/claude-design-brief.md | pbcopy   # macOS: 클립보드로 복사
```

## Step 3 — 코드베이스 연결 (중요)

Claude Design의 **"Connect codebase"** 또는 **"Inherit design system"** 옵션이 보이면:

- **GitHub 리포지토리 연결**: `github.com/<당신의-user>/forming` (이 레포가 GitHub에 있다면)
- **또는 수동 업로드**: `src/app/globals.css`, `src/app/layout.tsx`, `tailwind.config.*`(있다면), 주요 컴포넌트 3–5개 (Home page, TutorLesson, ChapterClient)

Claude Design이 기존 Tailwind 설정을 읽어서 토큰을 상속하도록.

## Step 4 — 프로토타입 생성 요청

브리프 첨부 후 요청:

> 브리프 기준으로 6개 화면 중 **홈(/)**, **문제 풀이(/problem/[id])**, **결과(/result/[id])** 3개를 대표 화면으로 **2–3개 비주얼 방향 변형**으로 만들어줘.
> 각 변형은 성격이 달라야 함: 예를 들어 방향 A=친근한 프리미엄, B=교육적 놀이감, C=손글씨 튜터.
> 각 변형에 디자인 토큰(색상 hex, 폰트, 간격 스케일)을 함께 제시.

## Step 5 — 방향 선택 + 세부 조정

- 3개 변형 중 하나 선택 (혹은 요소 remix — "A의 색 + B의 레이아웃")
- 나머지 3개 화면(챕터 선택, 튜터, 개념 설명)도 선택된 방향으로 확장 요청
- **한국어 폰트 결정 질문**: Pretendard / Noto Sans KR / Spoqa Han Sans Neo 중 추천 이유 확인
- **다크 모드** 여부 결정

## Step 6 — Handoff 번들 Export

Claude Design에서 **"Handoff to Claude Code"** 또는 **"Export bundle"** 클릭:

- 번들 형식: 일반적으로 `.zip` 또는 JSON + 자산 링크 묶음
- 번들에 포함되어야 할 것:
  - 디자인 토큰 (`theme.css` 또는 JSON)
  - 컴포넌트 스펙 (React/TSX 스니펫 가능하면)
  - 스크린 이미지 (PNG 또는 SVG 모든 변형)
  - README 또는 구현 가이드

**번들 저장 위치** (Claude Code에서 찾을 수 있는 곳):

```
~/.gstack/projects/forming/designs/claude-design-handoff-<날짜>/
```

또는 프로젝트 내:

```
.context/claude-design-handoff/
```

## Step 7 — Claude Code로 돌아오기

터미널에서 Claude Code 세션으로 돌아와서 다음 중 하나를 입력:

- **옵션 A (자동)**: `claude-design handoff 번들 받아왔어. .context/claude-design-handoff/에 있어.`
- **옵션 B (수동)**: 번들 URL 또는 경로를 직접 알려주기
- **옵션 C (스크린샷만)**: 시각 결과만 공유하고 Claude Code가 DESIGN.md를 추출

Claude Code가 자동으로:
1. 번들 파싱 → 토큰을 `src/app/globals.css`에 반영
2. `DESIGN.md` 생성 (프로젝트 루트)
3. `/design-review`로 각 화면을 라이브 서버에서 감사 + 코드 수정

## Step 8 — 검수 & 반영

최종 `/design-review` 완료 후:

```bash
bun run dev   # 로컬 서버
# 각 화면을 직접 클릭하며 확인
```

검수 체크리스트:

- [ ] 모든 UI 텍스트가 한국어
- [ ] 한국어 폰트가 올바르게 로드됨 (Pretendard 등)
- [ ] 손글씨 캔버스 크기가 충분히 큼
- [ ] 터치 타깃 ≥ 48px (특히 태블릿에서)
- [ ] 색상 대비 WCAG AA 이상
- [ ] 문제 풀이 → 결과 → 튜터 플로우 자연스러움
- [ ] 오답 피드백이 좌절감 주지 않음
- [ ] KaTeX 수식이 새 타이포그래피와 어울림
- [ ] SVG 다이어그램 색상이 새 팔레트와 조화로움
- [ ] `bun run typecheck && bun run lint` 통과

---

## 트러블슈팅

### Claude Design이 Pro 구독만 허용하는 경우
- Claude Code(이 터미널)에서 `/design-consultation`과 `/design-shotgun`만으로 진행 가능
- 시각 탐색은 제한적이지만 DESIGN.md + /design-review로 충분히 개선 가능

### Handoff 번들 포맷을 이해하기 어려운 경우
- 스크린샷 PNG 3–5장만 저장해도 OK
- Claude Code가 이미지를 보고 토큰을 역추출 (`$D extract` 사용)

### claude.ai에서 한국어 폰트 프리뷰가 안 될 때
- 브리프에 "Pretendard Variable via CDN" 링크 명시:
  ```
  https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/variable/pretendardvariable-dynamic-subset.css
  ```

---

## 참고 링크

- [Claude Design 시작 가이드](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)
- [Pretendard 폰트](https://github.com/orioncactus/pretendard)
- [Tailwind CSS 4 @theme 문법](https://tailwindcss.com/docs/theme)
