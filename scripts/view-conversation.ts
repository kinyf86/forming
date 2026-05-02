#!/usr/bin/env bun
/**
 * Conversation viewer — inspect a student's session or list their sessions.
 *
 * Usage:
 *   bun scripts/view-conversation.ts list <clientId>
 *   bun scripts/view-conversation.ts show <clientId> <sessionId> [--ai]
 *
 * Example:
 *   bun scripts/view-conversation.ts list student-6a40bea8
 *   bun scripts/view-conversation.ts show student-6a40bea8 sess-xxx --ai
 */

import fs from "fs";
import path from "path";
import {
  listSessions,
  getConversation,
  getAICalls,
  type ConversationTurnRecord,
  type AICallRecord,
  type SessionSummary,
} from "../src/lib/history";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function listCommand(clientId: string) {
  const sessions: SessionSummary[] = listSessions(clientId);
  if (sessions.length === 0) {
    console.log(`${DIM}No sessions found for ${clientId}${RESET}`);
    return;
  }

  console.log(
    `${BOLD}${sessions.length} sessions for ${CYAN}${clientId}${RESET}\n`
  );

  for (const s of sessions) {
    const typeColor =
      s.sessionType === "tutor"
        ? GREEN
        : s.sessionType === "problem_feedback"
          ? YELLOW
          : MAGENTA;
    const duration = Math.round((s.lastTimestamp - s.firstTimestamp) / 1000);
    const ctx = [
      s.contextRef.chapterId && `ch=${s.contextRef.chapterId}`,
      s.contextRef.problemId && `p=${s.contextRef.problemId}`,
      s.contextRef.concept && `c=${s.contextRef.concept}`,
    ]
      .filter(Boolean)
      .join(" ");

    console.log(
      `  ${fmtTime(s.lastTimestamp)}  ${typeColor}${s.sessionType.padEnd(18)}${RESET}` +
        `  ${s.turnCount} turns  ${DIM}(${duration}s)${RESET}  ${CYAN}${s.sessionId}${RESET}`
    );
    if (ctx) console.log(`    ${DIM}${ctx}${RESET}`);
  }
}

function showCommand(clientId: string, sessionId: string, withAI: boolean) {
  const turns: ConversationTurnRecord[] = getConversation(clientId, sessionId);
  if (turns.length === 0) {
    console.log(`${DIM}No conversation found for session ${sessionId}${RESET}`);
    return;
  }

  console.log(
    `${BOLD}Session ${CYAN}${sessionId}${RESET}${BOLD} — ${turns.length} turns — type: ${turns[0].sessionType}${RESET}\n`
  );

  for (const turn of turns) {
    const roleColor = turn.role === "user" ? CYAN : GREEN;
    const roleLabel = turn.role === "user" ? "학생" : "AI  ";
    const attachments = turn.attachments
      .map((a) => `[${a.type}${a.path ? ` ${a.path}` : ""}]`)
      .join(" ");

    console.log(`${DIM}${fmtTime(turn.timestamp)}${RESET}  ${roleColor}${BOLD}${roleLabel}${RESET}`);
    console.log(turn.text);
    if (attachments) console.log(`${DIM}${attachments}${RESET}`);
    if (turn.meta) {
      const metaStr = Object.entries(turn.meta)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(",")}]` : v}`)
        .join("  ");
      if (metaStr) console.log(`${DIM}  ${metaStr}${RESET}`);
    }
    console.log();
  }

  if (withAI) {
    const calls: AICallRecord[] = getAICalls(clientId, sessionId);
    console.log(`${BOLD}${MAGENTA}━━ AI Calls (${calls.length}) ━━${RESET}\n`);
    for (const call of calls) {
      const status = call.error ? `${RED}ERROR${RESET}` : `${GREEN}OK${RESET}`;
      const tokens = call.tokenUsage
        ? `${call.tokenUsage.input}→${call.tokenUsage.output} tok`
        : "(tok n/a)";
      const cost = call.totalCostUsd
        ? `$${call.totalCostUsd.toFixed(4)}`
        : "";
      console.log(
        `${DIM}${fmtTime(call.timestamp)}${RESET}  ${status}  ` +
          `${call.endpoint}  ${call.latencyMs}ms  ${tokens}  ${cost}`
      );
      console.log(`  ${DIM}prompt (${call.prompt.length} chars):${RESET} ${truncate(call.prompt, 200)}`);
      console.log(`  ${DIM}response:${RESET} ${truncate(call.response, 200)}`);
      if (call.error) console.log(`  ${RED}error: ${call.error}${RESET}`);
      console.log();
    }
  }
}

function main() {
  const [, , cmd, clientId, sessionId, ...flags] = process.argv;

  if (!cmd || !clientId) {
    console.log(`Usage:
  bun scripts/view-conversation.ts list <clientId>
  bun scripts/view-conversation.ts show <clientId> <sessionId> [--ai]`);
    process.exit(1);
  }

  // Sanity check: history dir exists?
  const historyDir = path.join(process.cwd(), "src/data/history");
  if (!fs.existsSync(historyDir)) {
    console.log(`${RED}No history dir at ${historyDir}${RESET}`);
    process.exit(1);
  }

  if (cmd === "list") {
    listCommand(clientId);
  } else if (cmd === "show") {
    if (!sessionId) {
      console.log(`${RED}sessionId required for 'show'${RESET}`);
      process.exit(1);
    }
    showCommand(clientId, sessionId, flags.includes("--ai"));
  } else {
    console.log(`${RED}Unknown command: ${cmd}${RESET}`);
    process.exit(1);
  }
}

main();
