#!/usr/bin/env bun
/**
 * Axis-grounded query demo for Phase A.
 *
 * Usage:
 *   bun scripts/query-axis.ts                     # show coverage summary
 *   bun scripts/query-axis.ts --grade 7
 *   bun scripts/query-axis.ts --axis difficulty.combination_mode --value chain
 *   bun scripts/query-axis.ts --axis cognitive.misconception_tag
 *
 * Reads v2 problem JSONs from src/data/problems/curated/ and reports
 * which problems have axes inferred and which slices match. Demonstrates
 * the value of central dimension registry — same query language across
 * all entities.
 */

import fs from "fs";
import path from "path";
import { ProblemV2Schema, isProblemV2 } from "../src/lib/schemas/problem";
import { AXIS_NAMES } from "../src/lib/dimensions/registry";
import type { AxisName } from "../src/lib/dimensions/types";

const CURATED_DIR = path.join(process.cwd(), "src/data/problems/curated");

interface Args {
  grade?: number;
  axis?: AxisName;
  value?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--grade") args.grade = parseInt(argv[++i], 10);
    else if (a === "--axis") args.axis = argv[++i] as AxisName;
    else if (a === "--value") args.value = argv[++i];
  }
  return args;
}

function gradeFromTopicId(topicId: string): number | null {
  const m = topicId.match(/^(?:math|sci)-(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

function loadAllV2() {
  const files = fs.readdirSync(CURATED_DIR).filter((f) => f.endsWith(".json"));
  const problems = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(CURATED_DIR, f), "utf-8"));
      if (!isProblemV2(raw)) continue;
      problems.push(ProblemV2Schema.parse(raw));
    } catch {
      // skip
    }
  }
  return problems;
}

function summarize(problems: ReturnType<typeof loadAllV2>, args: Args) {
  let pool = problems;
  if (args.grade != null) {
    pool = pool.filter((p) => gradeFromTopicId(p.topicId) === args.grade);
  }

  console.log(`\n=== Axis Coverage Summary ===`);
  console.log(`Total v2 problems: ${pool.length}${args.grade ? ` (grade ${args.grade})` : ""}`);

  const inferred = pool.filter((p) => p.axes != null).length;
  console.log(`With axes inferred: ${inferred} / ${pool.length}`);
  console.log(`Validation breakdown:`);
  for (const status of ["PASS", "REVISE", "REJECT", "NEEDS_HUMAN", "UNCHECKED"]) {
    const n = pool.filter((p) => p.validation.status === status).length;
    if (n > 0) console.log(`  ${status.padEnd(12)} ${n}`);
  }

  if (!args.axis) {
    console.log(`\nKnown axes: ${AXIS_NAMES.join(", ")}`);
    console.log(`\nTry: --axis difficulty.combination_mode --value chain`);
    return;
  }

  const withAxis = pool.filter((p) => p.axes && args.axis! in p.axes);
  console.log(`\nProblems with ${args.axis}: ${withAxis.length}`);

  if (withAxis.length === 0) {
    console.log(`(no problems yet — run Phase B review or batch axis inference)`);
    return;
  }

  if (args.value) {
    const matching = withAxis.filter((p) => {
      const v = p.axes![args.axis!].value as unknown;
      return Array.isArray(v) ? v.includes(args.value) : String(v) === args.value;
    });
    console.log(`Matching ${args.axis}=${args.value}: ${matching.length}`);
    for (const p of matching.slice(0, 20)) {
      console.log(`  ${p.id}  (${p.topicId}, difficulty=${p.difficulty})`);
    }
    if (matching.length > 20) console.log(`  ... and ${matching.length - 20} more`);
    return;
  }

  const dist: Record<string, number> = {};
  for (const p of withAxis) {
    const v = p.axes![args.axis!].value as unknown;
    const key = Array.isArray(v) ? v.join("+") || "(empty)" : String(v);
    dist[key] = (dist[key] ?? 0) + 1;
  }
  console.log(`\nValue distribution:`);
  for (const [k, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(k).padEnd(40)} ${n}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const problems = loadAllV2();
summarize(problems, args);
