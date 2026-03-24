@AGENTS.md

# Forming - AI 학습 도구

## 프로젝트 개요
초등학생을 위한 AI 기반 학습 도구. Next.js + Excalidraw + Claude Code CLI.

## AI Agentic 구현 원칙

기능 구현 시 하드코딩/매핑 방식보다 **AI에게 컨텍스트와 의도를 전달하여 자율적으로 판단하게 하는 방식**을 우선합니다.

### DO (AI agentic)
- 프롬프트에 **의도와 맥락**을 전달하고 AI가 판단하게 하기
  - 예: "대한민국 교육과정에서 사용하는 용어로 설명하세요" (AI가 적절한 용어를 선택)
  - 예: "학생의 풀이과정을 분석하여 약점을 파악하세요" (AI가 자율 분석)
- 교육과정, 학년, 나라 등의 **컨텍스트를 프롬프트로 제공**하여 AI가 적응하게 하기
- 문제 생성, 난이도 조절, 풀이 설명 등을 **AI의 판단에 위임**하기

### DON'T (하드코딩)
- 용어 매핑 테이블을 만들어 하나씩 치환하기 (gcd→최대공약수 같은 딕셔너리)
- 난이도를 규칙 기반으로 점수화하기
- 풀이 템플릿을 미리 정의해두기
- AI가 할 수 있는 판단을 코드로 대체하기

### 판단 기준
"이 로직을 AI 프롬프트로 대체할 수 있는가?" → Yes라면 프롬프트로 구현.
코드는 **데이터 흐름, 저장, UI 렌더링**에 집중하고, **판단과 생성**은 AI에게 맡깁니다.

## 기술 스택
- Frontend: Next.js 15 (App Router) + Tailwind CSS
- 캔버스: @excalidraw/excalidraw (펜/텍스트 입력)
- AI: Claude Code CLI (`claude -p`, stream-json for vision)
- 데이터: JSON 파일 (src/data/generated/, src/data/history/)
- 로케일: src/lib/locale.ts (프롬프트 기반 다국어 지원)

## 주요 구조
- src/app/api/ - AI 호출 API 라우트 (analyze, chat, generate-problem, etc.)
- src/lib/prompts.ts - AI 프롬프트 템플릿 (여기서 컨텍스트를 조합)
- src/lib/locale.ts - 나라별 tutorPrompt (AI가 교육과정에 맞게 자율 적응)
- src/lib/history.ts - 학생 풀이 이력 JSONL 저장
- src/data/curriculum/ - 교육과정 데이터 (학년/단원/개념)
