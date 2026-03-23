"use client";

import { useMemo } from "react";

interface DiagramSvgProps {
  svg: string;
  animated?: boolean;
}

export function DiagramSvg({ svg, animated = false }: DiagramSvgProps) {
  const sanitized = useMemo(() => {
    let clean = svg
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\s+on\w+="[^"]*"/gi, "")
      .replace(/\s+on\w+='[^']*'/gi, "");

    if (!clean.trim().startsWith("<svg")) {
      clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${clean}</svg>`;
    }

    if (animated && !clean.includes("diagram-animated")) {
      clean = clean.replace("<svg", '<svg class="diagram-animated"');
    }

    return clean;
  }, [svg, animated]);

  return (
    <div className="my-4 flex justify-center">
      <div
        className="diagram-container w-full max-w-md"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
      <style>{`
        .diagram-container svg {
          width: 100%;
          height: auto;
          display: block;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .diagram-animated .step {
          opacity: 0;
          animation: fadeInStep 0.5s ease-in forwards;
        }
        .diagram-animated .step:nth-child(1) { animation-delay: 0s; }
        .diagram-animated .step:nth-child(2) { animation-delay: 0.8s; }
        .diagram-animated .step:nth-child(3) { animation-delay: 1.6s; }
        .diagram-animated .step:nth-child(4) { animation-delay: 2.4s; }
        .diagram-animated .step:nth-child(5) { animation-delay: 3.2s; }
        .diagram-animated .step:nth-child(6) { animation-delay: 4.0s; }
        @keyframes fadeInStep {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
