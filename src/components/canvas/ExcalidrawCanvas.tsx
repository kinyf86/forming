"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-100">
        <span className="text-gray-400">캔버스 로딩 중...</span>
      </div>
    ),
  }
);

interface ExcalidrawCanvasProps {
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
  height?: string;
}

const STROKE_WIDTHS = [
  { label: "얇게", value: 0.5 },
  { label: "보통", value: 1 },
  { label: "굵게", value: 2 },
];

export function ExcalidrawCanvas({
  onApiReady,
  height = "400px",
}: ExcalidrawCanvasProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [strokeWidth, setStrokeWidth] = useState(1);

  const handleApiReady = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;
      onApiReady?.(api);
    },
    [onApiReady]
  );

  const handleStrokeChange = (width: number) => {
    setStrokeWidth(width);
    if (apiRef.current) {
      apiRef.current.updateScene({
        appState: { currentItemStrokeWidth: width },
      });
    }
  };

  return (
    <div>
      {/* 펜 굵기 조절 */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm text-gray-600">펜 굵기:</span>
        {STROKE_WIDTHS.map((sw) => (
          <button
            key={sw.value}
            onClick={() => handleStrokeChange(sw.value)}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              strokeWidth === sw.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {sw.label}
          </button>
        ))}
      </div>

      <div
        style={{ height }}
        className="relative overflow-hidden rounded-lg border bg-white"
      >
        <Excalidraw
          excalidrawAPI={handleApiReady}
          langCode="ko-KR"
          initialData={{
            appState: {
              currentItemStrokeWidth: 1,
              currentItemFontSize: 16,
            },
          }}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
            },
            tools: {
              image: false,
            },
          }}
        />
      </div>

      {/* 도형 도구 숨기기 CSS */}
      <style>{`
        [data-testid="toolbar-rectangle"],
        [data-testid="toolbar-diamond"],
        [data-testid="toolbar-ellipse"],
        [data-testid="toolbar-arrow"],
        [data-testid="toolbar-line"],
        [data-testid="toolbar-image"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

export async function exportCanvasAsBase64(
  api: ExcalidrawImperativeAPI
): Promise<string | null> {
  const elements = api.getSceneElements().filter((el) => !el.isDeleted);
  if (elements.length === 0) return null;

  const { exportToBlob } = await import("@excalidraw/excalidraw");
  const blob = await exportToBlob({
    elements,
    appState: { ...api.getAppState(), exportWithDarkMode: false },
    files: api.getFiles(),
    mimeType: "image/png",
    exportPadding: 20,
  });

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:image/png;base64, prefix
    };
    reader.readAsDataURL(blob);
  });
}

export function extractCanvasText(api: ExcalidrawImperativeAPI): string {
  const elements = api.getSceneElements();
  return elements
    .filter((el) => el.type === "text" && !el.isDeleted)
    .map((el) => (el as unknown as { text: string }).text)
    .join("\n");
}

export function describeCanvasDrawing(api: ExcalidrawImperativeAPI): string {
  const elements = api.getSceneElements();
  const descriptions: string[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    switch (el.type) {
      case "text":
        descriptions.push(
          `텍스트: "${(el as unknown as { text: string }).text}"`
        );
        break;
      case "freedraw":
        descriptions.push(`자유 그리기`);
        break;
    }
  }
  return descriptions.length > 0
    ? `학생의 캔버스에 다음 요소들이 있습니다: ${descriptions.join(", ")}`
    : "학생이 캔버스에 아무것도 그리지 않았습니다.";
}