import { describe, it, expect } from "vitest";
import { PathTraversalError } from "../sanitize";
import {
  getProblem,
  getTopics,
  getTopic,
  getProblemsByTopic,
} from "../problems";

describe("problems — security", () => {
  it("getProblem throws PathTraversalError for traversal input", () => {
    expect(() => getProblem("../../etc/passwd")).toThrow(PathTraversalError);
  });

  it("getProblem throws PathTraversalError for absolute path", () => {
    expect(() => getProblem("/etc/passwd")).toThrow(PathTraversalError);
  });

  it("getProblem throws PathTraversalError for backslash traversal", () => {
    expect(() => getProblem("..\\..\\secret")).toThrow(PathTraversalError);
  });
});

describe("problems — happy path", () => {
  it("getProblem returns undefined for nonexistent ID", () => {
    expect(getProblem("nonexistent-id")).toBeUndefined();
  });

  it("getTopics returns array of topics", () => {
    const topics = getTopics();
    expect(Array.isArray(topics)).toBe(true);
    expect(topics.length).toBeGreaterThan(0);
  });

  it("getTopic returns topic by ID", () => {
    const topics = getTopics();
    if (topics.length > 0) {
      const topic = getTopic(topics[0].id);
      expect(topic).toBeDefined();
      expect(topic!.id).toBe(topics[0].id);
    }
  });

  it("getTopic returns undefined for nonexistent ID", () => {
    expect(getTopic("nonexistent-topic")).toBeUndefined();
  });

  it("getProblemsByTopic returns array", () => {
    const result = getProblemsByTopic("nonexistent-topic");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});
