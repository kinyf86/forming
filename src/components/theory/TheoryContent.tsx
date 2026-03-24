"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function TheoryContent({ content }: { content: string }) {
  return (
    <div className="prose prose-blue max-w-none prose-table:border-collapse prose-td:border prose-td:border-gray-300 prose-td:px-3 prose-td:py-1 prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:px-3 prose-th:py-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
