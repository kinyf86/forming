import { spawn } from "child_process";

/**
 * Text-only prompt via claude -p
 */
export async function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      ["-p", prompt, "--output-format", "text", "--model", "claude-sonnet-4-6"],
      { env: { ...process.env } }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `claude exited with code ${code}`));
    });
    setTimeout(() => {
      proc.kill();
      reject(new Error("Claude CLI timeout"));
    }, 120_000);
  });
}

/**
 * Prompt with image (base64 PNG) via stream-json
 */
export async function askClaudeWithImage(
  prompt: string,
  imageBase64: string,
  mimeType: string = "image/png"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      [
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        "--model", "claude-sonnet-4-6",
      ],
      { env: { ...process.env } }
    );

    let output = "";
    proc.stdout.on("data", (d) => (output += d));
    proc.stderr.on("data", () => {});

    proc.on("close", () => {
      // Parse stream-json output to find the result
      for (const line of output.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "result") {
            if (parsed.is_error) {
              reject(new Error(parsed.result || "Claude returned error"));
            } else {
              resolve(parsed.result || "");
            }
            return;
          }
        } catch {
          // skip non-JSON lines
        }
      }
      reject(new Error("No result in Claude output"));
    });

    // Send message with image
    const message = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: imageBase64 },
          },
        ],
      },
    });
    proc.stdin.write(message + "\n");
    proc.stdin.end();

    setTimeout(() => {
      proc.kill();
      reject(new Error("Claude CLI timeout"));
    }, 120_000);
  });
}

export function parseJsonFromResponse(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from ```json blocks
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    // Try to find JSON object in text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error("Could not parse JSON from response");
  }
}
