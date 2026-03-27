import path from "path";

/**
 * Error thrown when a user-supplied value contains path traversal sequences.
 */
export class PathTraversalError extends Error {
  constructor(input: string) {
    super(`Invalid path segment: "${input}"`);
    this.name = "PathTraversalError";
  }
}

/**
 * Layer 1: Validate that a user-supplied string is a safe filename segment.
 * Rejects slashes, null bytes, dots-only, and anything that changes under path.basename().
 * Throws PathTraversalError on invalid input.
 */
export function sanitizePathSegment(input: string): string {
  if (!input || typeof input !== "string") {
    throw new PathTraversalError(String(input));
  }
  if (input.includes("\0")) {
    throw new PathTraversalError(input);
  }
  if (input.includes("/") || input.includes("\\") || input === "." || input === "..") {
    throw new PathTraversalError(input);
  }
  const sanitized = path.basename(input);
  if (!sanitized || sanitized !== input) {
    throw new PathTraversalError(input);
  }
  return sanitized;
}

/**
 * Layer 2: Verify that a resolved file path stays within the expected base directory.
 * Defense-in-depth — catches any traversal that slips past segment validation.
 */
export function assertWithinBase(filePath: string, baseDir: string): void {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new PathTraversalError(filePath);
  }
}
