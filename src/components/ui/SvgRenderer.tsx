"use client";

import DOMPurify from "dompurify";

interface SvgRendererProps {
  svg: string | null;
  className?: string;
  fallbackText?: string;
}

const PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ["animate", "animateTransform", "set"],
  ADD_ATTR: [
    "viewBox",
    "preserveAspectRatio",
    "xmlns",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "font-family",
    "font-size",
    "font-weight",
    "text-anchor",
    "dominant-baseline",
    "opacity",
    "rx",
    "ry",
    "cx",
    "cy",
    "r",
    "d",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "points",
    "transform",
  ],
};

export default function SvgRenderer({
  svg,
  className = "",
  fallbackText,
}: SvgRendererProps) {
  if (!svg) {
    return fallbackText ? (
      <p className="text-gray-500 text-sm italic">{fallbackText}</p>
    ) : null;
  }

  // Strip markdown code fences if present
  let cleaned = svg.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
  }

  const sanitized = DOMPurify.sanitize(cleaned, PURIFY_CONFIG);

  return (
    <div
      className={`svg-renderer w-full flex justify-center ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
      style={{ maxWidth: "100%", overflow: "hidden" }}
    />
  );
}
