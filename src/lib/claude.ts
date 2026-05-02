import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { appendAICall, type AICallRecord } from "./history";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 180_000;

export interface AICallLogContext {
  clientId: string;
  endpoint: string;
  sessionId?: string;
}

function writeLog(
  ctx: AICallLogContext | undefined,
  partial: Omit<AICallRecord, "type" | "id" | "timestamp" | "sessionId" | "model">
): void {
  if (!ctx) return;
  const record: AICallRecord = {
    type: "ai_call",
    id: `call-${randomUUID()}`,
    timestamp: Date.now(),
    sessionId: ctx.sessionId ?? null,
    model: DEFAULT_MODEL,
    ...partial,
  };
  appendAICall(ctx.clientId, record);
}

/**
 * Text-only prompt via claude -p
 * Token usage unavailable on text output; logged as null.
 */
export async function askClaude(
  prompt: string,
  logCtx?: AICallLogContext
): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      ["-p", prompt, "--output-format", "text", "--model", DEFAULT_MODEL],
      { env: { ...process.env } }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      const latencyMs = Date.now() - start;
      if (code === 0) {
        const out = stdout.trim();
        writeLog(logCtx, {
          endpoint: logCtx?.endpoint ?? "unknown",
          prompt,
          response: out,
          latencyMs,
          tokenUsage: null,
          totalCostUsd: null,
          hasImage: false,
          error: null,
        });
        resolve(out);
      } else {
        const errMsg = stderr || `claude exited with code ${code}`;
        writeLog(logCtx, {
          endpoint: logCtx?.endpoint ?? "unknown",
          prompt,
          response: "",
          latencyMs,
          tokenUsage: null,
          totalCostUsd: null,
          hasImage: false,
          error: errMsg,
        });
        reject(new Error(errMsg));
      }
    });
    setTimeout(() => {
      proc.kill();
      const latencyMs = Date.now() - start;
      writeLog(logCtx, {
        endpoint: logCtx?.endpoint ?? "unknown",
        prompt,
        response: "",
        latencyMs,
        tokenUsage: null,
        totalCostUsd: null,
        hasImage: false,
        error: "Claude CLI timeout",
      });
      reject(new Error("Claude CLI timeout"));
    }, TIMEOUT_MS);
  });
}

/**
 * Prompt with image (base64 PNG) via stream-json.
 * Token usage + cost extracted from the stream-json "result" event.
 */
export async function askClaudeWithImage(
  prompt: string,
  imageBase64: string,
  mimeType: string = "image/png",
  logCtx?: AICallLogContext
): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      [
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        "--model", DEFAULT_MODEL,
      ],
      { env: { ...process.env } }
    );

    let output = "";
    proc.stdout.on("data", (d) => (output += d));
    proc.stderr.on("data", () => {});

    proc.on("close", () => {
      const latencyMs = Date.now() - start;
      let result = "";
      let tokenUsage: AICallRecord["tokenUsage"] = null;
      let totalCostUsd: number | null = null;
      let error: string | null = null;

      for (const line of output.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "result") {
            if (parsed.is_error) {
              error = parsed.result || "Claude returned error";
            } else {
              result = parsed.result || "";
            }
            if (parsed.usage) {
              tokenUsage = {
                input: parsed.usage.input_tokens ?? 0,
                output: parsed.usage.output_tokens ?? 0,
              };
            }
            if (typeof parsed.total_cost_usd === "number") {
              totalCostUsd = parsed.total_cost_usd;
            }
          }
        } catch {
          // skip non-JSON lines
        }
      }

      if (!result && !error) {
        error = "No result in Claude output";
      }

      writeLog(logCtx, {
        endpoint: logCtx?.endpoint ?? "unknown",
        prompt,
        response: result,
        latencyMs,
        tokenUsage,
        totalCostUsd,
        hasImage: true,
        error,
      });

      if (error) reject(new Error(error));
      else resolve(result);
    });

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
      const latencyMs = Date.now() - start;
      writeLog(logCtx, {
        endpoint: logCtx?.endpoint ?? "unknown",
        prompt,
        response: "",
        latencyMs,
        tokenUsage: null,
        totalCostUsd: null,
        hasImage: true,
        error: "Claude CLI timeout",
      });
      reject(new Error("Claude CLI timeout"));
    }, TIMEOUT_MS);
  });
}

export function parseJsonFromResponse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error("Could not parse JSON from response");
  }
}
