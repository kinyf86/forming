export interface LocaleConfig {
  code: string;
  country: string;
  language: string;
  gradeLabel: (grade: number) => string;
  tutorPrompt: string;
}

const locales: Record<string, LocaleConfig> = {
  "ko-KR": {
    code: "ko-KR",
    country: "대한민국",
    language: "한국어",
    gradeLabel: (grade) => `초등학교 ${grade}학년`,
    tutorPrompt: `한국어로 설명하세요. 영어 수학 용어(gcd, lcm, fraction 등)를 사용하지 말고 대한민국 초등 교육과정에서 사용하는 한국어 용어를 사용하세요. 용어를 처음 사용할 때는 괄호 안에 뜻을 함께 설명하세요.`,
  },
  "en-US": {
    code: "en-US",
    country: "United States",
    language: "English",
    gradeLabel: (grade) => `Grade ${grade}`,
    tutorPrompt: `Explain in English using math terminology from the US Common Core curriculum appropriate for the student's grade level. When introducing a new term, briefly explain what it means.`,
  },
  "ja-JP": {
    code: "ja-JP",
    country: "日本",
    language: "日本語",
    gradeLabel: (grade) => `小学${grade}年生`,
    tutorPrompt: `日本語で説明してください。日本の学習指導要領で使われる数学用語を使用してください。用語を初めて使う時は括弧内に意味を説明してください。`,
  },
};

let currentLocale: string = "ko-KR";

export function setLocale(code: string): void {
  if (locales[code]) currentLocale = code;
}

export function getLocale(): LocaleConfig {
  return locales[currentLocale];
}

export function getAvailableLocales(): { code: string; country: string }[] {
  return Object.values(locales).map((l) => ({ code: l.code, country: l.country }));
}
