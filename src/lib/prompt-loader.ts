import fs from "fs";
import path from "path";

const PROMPTS_DIR = path.join(process.cwd(), "src/data/prompts");

/**
 * 마크다운 프롬프트 파일을 로드하고 변수를 치환합니다.
 * {{변수명}} 형태의 플레이스홀더를 vars 객체의 값으로 교체합니다.
 */
export function loadPrompt(
  name: string,
  vars: Record<string, string | number>
): string {
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);
  let content = fs.readFileSync(filePath, "utf-8");

  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, String(value));
  }

  return content;
}
