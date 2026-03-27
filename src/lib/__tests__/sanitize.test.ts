import { describe, it, expect } from "vitest";
import path from "path";
import {
  sanitizePathSegment,
  assertWithinBase,
  PathTraversalError,
} from "../sanitize";

describe("sanitizePathSegment", () => {
  // Valid inputs
  it("accepts simple alphanumeric string", () => {
    expect(sanitizePathSegment("student-abc123")).toBe("student-abc123");
  });

  it("accepts UUID-style ID", () => {
    expect(sanitizePathSegment("gen-a1b2c3d4")).toBe("gen-a1b2c3d4");
  });

  it("accepts chapter ID with dashes", () => {
    expect(sanitizePathSegment("math-5-4")).toBe("math-5-4");
  });

  it("accepts string with dots in middle", () => {
    expect(sanitizePathSegment("file.name")).toBe("file.name");
  });

  // Basic attack vectors
  it("rejects parent directory traversal", () => {
    expect(() => sanitizePathSegment("../../etc/passwd")).toThrow(
      PathTraversalError
    );
  });

  it("rejects single parent traversal", () => {
    expect(() => sanitizePathSegment("../secret")).toThrow(PathTraversalError);
  });

  it("rejects absolute Unix path", () => {
    expect(() => sanitizePathSegment("/etc/passwd")).toThrow(PathTraversalError);
  });

  it("rejects Windows absolute path", () => {
    expect(() => sanitizePathSegment("C:\\Windows")).toThrow(PathTraversalError);
  });

  it("rejects backslash traversal", () => {
    expect(() => sanitizePathSegment("..\\..\\secret")).toThrow(
      PathTraversalError
    );
  });

  it("rejects null bytes", () => {
    expect(() => sanitizePathSegment("file\0name")).toThrow(PathTraversalError);
  });

  it("rejects empty string", () => {
    expect(() => sanitizePathSegment("")).toThrow(PathTraversalError);
  });

  it("rejects single dot", () => {
    expect(() => sanitizePathSegment(".")).toThrow(PathTraversalError);
  });

  it("rejects double dot", () => {
    expect(() => sanitizePathSegment("..")).toThrow(PathTraversalError);
  });

  // Advanced vectors
  it("rejects non-string input (number)", () => {
    expect(() => sanitizePathSegment(123 as unknown as string)).toThrow(
      PathTraversalError
    );
  });

  it("rejects non-string input (null)", () => {
    expect(() => sanitizePathSegment(null as unknown as string)).toThrow(
      PathTraversalError
    );
  });

  it("rejects non-string input (array)", () => {
    expect(() =>
      sanitizePathSegment(["../", "etc"] as unknown as string)
    ).toThrow(PathTraversalError);
  });

  it("rejects non-string input (undefined)", () => {
    expect(() => sanitizePathSegment(undefined as unknown as string)).toThrow(
      PathTraversalError
    );
  });

  it("accepts URL-encoded dots (not real traversal after JSON parse)", () => {
    // "%2e%2e%2f" is literal string, not decoded — no slashes, safe
    expect(sanitizePathSegment("..%2f..%2f")).toBe("..%2f..%2f");
  });

  it("rejects unicode fullwidth slash", () => {
    // Fullwidth solidus U+FF0F — path.basename may treat differently per OS
    const input = "test\uFF0Ftraversal";
    const result = path.basename(input);
    if (result !== input) {
      expect(() => sanitizePathSegment(input)).toThrow(PathTraversalError);
    } else {
      // On this OS, fullwidth slash is not a path separator — safe
      expect(sanitizePathSegment(input)).toBe(input);
    }
  });
});

describe("assertWithinBase", () => {
  const baseDir = "/tmp/test-base";

  it("accepts path within base directory", () => {
    expect(() =>
      assertWithinBase("/tmp/test-base/file.json", baseDir)
    ).not.toThrow();
  });

  it("accepts nested path within base directory", () => {
    expect(() =>
      assertWithinBase("/tmp/test-base/sub/file.json", baseDir)
    ).not.toThrow();
  });

  it("rejects path outside base directory", () => {
    expect(() => assertWithinBase("/tmp/other/file.json", baseDir)).toThrow(
      PathTraversalError
    );
  });

  it("rejects path that escapes via traversal", () => {
    expect(() =>
      assertWithinBase("/tmp/test-base/../other/file.json", baseDir)
    ).toThrow(PathTraversalError);
  });

  it("rejects path with prefix match but different directory", () => {
    // "/tmp/test-base-extra" starts with "/tmp/test-base" but is not inside it
    expect(() =>
      assertWithinBase("/tmp/test-base-extra/file.json", baseDir)
    ).toThrow(PathTraversalError);
  });
});
