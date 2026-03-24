"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import getStroke from "perfect-freehand";

// --- Types ---

interface Point {
  x: number;
  y: number;
  pressure: number;
}

interface Stroke {
  points: Point[];
  color: string;
  size: number;
}

interface TextElement {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface DrawingCanvasAPI {
  exportAsBase64: (maxSize?: number) => Promise<string | null>;
  extractText: () => string;
  describeDrawing: () => string;
  clear: () => void;
  undo: () => void;
  isEmpty: () => boolean;
}

interface DrawingCanvasProps {
  height?: string;
  compact?: boolean; // compact mode for chat mini canvas
}

// --- Stroke options presets ---

const STROKE_PRESETS = {
  thin: { size: 4, label: "얇게" },
  normal: { size: 8, label: "보통" },
  thick: { size: 14, label: "굵게" },
};

const COLORS = [
  { value: "#1a1a1a", label: "검정" },
  { value: "#4A90D9", label: "파랑" },
  { value: "#E74C3C", label: "빨강" },
  { value: "#5CB85C", label: "초록" },
];

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  start: { taper: true, cap: true },
  end: { taper: true, cap: true },
};

// --- Helper: convert stroke points to SVG path ---

function getSvgPathFromStroke(strokePoints: number[][]): string {
  if (strokePoints.length === 0) return "";

  const d = strokePoints.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...strokePoints[0], "Q"] as (string | number)[]
  );

  d.push("Z");
  return d.join(" ");
}

// --- Component ---

const MIN_HEIGHT = 200;
const RESIZE_HANDLE_HEIGHT = 12;

const DrawingCanvas = forwardRef<DrawingCanvasAPI, DrawingCanvasProps>(
  function DrawingCanvas({ height = "400px", compact = false }, ref) {
    const initialHeight = parseInt(height) || 400;
    const svgRef = useRef<SVGSVGElement>(null);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<"pen" | "eraser" | "text">("pen");
    const [strokeSize, setStrokeSize] = useState(8);
    const [strokeColor, setStrokeColor] = useState("#1a1a1a");
    const [texts, setTexts] = useState<TextElement[]>([]);
    const [editingText, setEditingText] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [canvasHeight, setCanvasHeight] = useState(initialHeight);
    const [isResizing, setIsResizing] = useState(false);
    const resizeStartY = useRef(0);
    const resizeStartHeight = useRef(0);

    // --- Imperative API ---
    useImperativeHandle(ref, () => ({
      exportAsBase64: async (maxSize = 768) => {
        if (strokes.length === 0 && texts.length === 0) return null;
        const svg = svgRef.current;
        if (!svg) return null;

        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: "image/svg+xml" });
        const url = URL.createObjectURL(svgBlob);

        return new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL("image/webp", 0.85);
            URL.revokeObjectURL(url);
            resolve(dataUrl.split(",")[1]);
          };
          img.src = url;
        });
      },

      extractText: () => texts.map((t) => t.text).join("\n"),

      describeDrawing: () => {
        const parts: string[] = [];
        if (strokes.length > 0) parts.push(`자유 그리기 ${strokes.length}개`);
        if (texts.length > 0)
          parts.push(...texts.map((t) => `텍스트: "${t.text}"`));
        return parts.length > 0
          ? `학생의 캔버스에 다음 요소들이 있습니다: ${parts.join(", ")}`
          : "학생이 캔버스에 아무것도 그리지 않았습니다.";
      },

      clear: () => {
        setStrokes([]);
        setTexts([]);
      },

      undo: () => {
        setStrokes((prev) => prev.slice(0, -1));
      },

      isEmpty: () => strokes.length === 0 && texts.length === 0,
    }));

    // --- Pointer events ---

    const getPoint = useCallback(
      (e: React.PointerEvent<SVGSVGElement>): Point => {
        const svg = svgRef.current!;
        const rect = svg.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          pressure: e.pressure || 0.5,
        };
      },
      []
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        if (tool === "text") {
          const pt = getPoint(e);
          const id = `t-${Date.now()}`;
          setTexts((prev) => [...prev, { id, x: pt.x, y: pt.y, text: "" }]);
          setEditingText(id);
          setTimeout(() => inputRef.current?.focus(), 50);
          return;
        }

        e.currentTarget.setPointerCapture(e.pointerId);
        const pt = getPoint(e);

        if (tool === "eraser") {
          // Erase strokes near this point
          setStrokes((prev) =>
            prev.filter((stroke) => {
              return !stroke.points.some(
                (p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 20
              );
            })
          );
          return;
        }

        setIsDrawing(true);
        setCurrentPoints([pt]);
      },
      [tool, getPoint]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        if (!isDrawing || tool !== "pen") return;
        const pt = getPoint(e);
        setCurrentPoints((prev) => [...prev, pt]);
      },
      [isDrawing, tool, getPoint]
    );

    const handlePointerUp = useCallback(() => {
      if (!isDrawing) return;
      setIsDrawing(false);

      if (currentPoints.length > 1) {
        setStrokes((prev) => [
          ...prev,
          { points: currentPoints, color: strokeColor, size: strokeSize },
        ]);
      }
      setCurrentPoints([]);
    }, [isDrawing, currentPoints, strokeColor, strokeSize]);

    // --- Text editing ---

    const handleTextChange = useCallback(
      (value: string) => {
        if (!editingText) return;
        setTexts((prev) =>
          prev.map((t) => (t.id === editingText ? { ...t, text: value } : t))
        );
      },
      [editingText]
    );

    const handleTextDone = useCallback(() => {
      setTexts((prev) => prev.filter((t) => t.text.trim() !== ""));
      setEditingText(null);
      setTool("pen");
    }, []);

    // --- Keyboard shortcut ---
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === "z") {
            e.preventDefault();
            setStrokes((prev) => prev.slice(0, -1));
          }
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, []);

    // --- Resize handle ---
    useEffect(() => {
      if (!isResizing) return;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientY - resizeStartY.current;
        setCanvasHeight(Math.max(MIN_HEIGHT, resizeStartHeight.current + delta));
      };
      const handleMouseUp = () => setIsResizing(false);

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }, [isResizing]);

    const handleResizeStart = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        resizeStartY.current = e.clientY;
        resizeStartHeight.current = canvasHeight;
        setIsResizing(true);
      },
      [canvasHeight]
    );

    // --- Render strokes ---

    const renderStroke = useCallback(
      (stroke: Stroke, index: number) => {
        const pts = stroke.points.map((p) => [p.x, p.y, p.pressure]);
        const outlinePoints = getStroke(pts, {
          ...STROKE_OPTIONS,
          size: stroke.size,
        });
        const pathData = getSvgPathFromStroke(outlinePoints);
        return <path key={index} d={pathData} fill={stroke.color} />;
      },
      []
    );

    const renderCurrentStroke = useCallback(() => {
      if (currentPoints.length < 2) return null;
      const pts = currentPoints.map((p) => [p.x, p.y, p.pressure]);
      const outlinePoints = getStroke(pts, {
        ...STROKE_OPTIONS,
        size: strokeSize,
      });
      const pathData = getSvgPathFromStroke(outlinePoints);
      return <path d={pathData} fill={strokeColor} opacity={0.8} />;
    }, [currentPoints, strokeSize, strokeColor]);

    return (
      <div>
        {/* Toolbar */}
        <div className={`mb-2 flex items-center gap-2 flex-wrap ${compact ? "gap-1" : ""}`}>
          {/* Tools */}
          <div className="flex gap-1">
            {(
              [
                { key: "pen", icon: "✏️", label: "펜" },
                { key: "text", icon: "T", label: "텍스트" },
                { key: "eraser", icon: "🧹", label: "지우개" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTool(t.key)}
                className={`rounded px-2 py-1 text-sm transition-colors ${
                  tool === t.key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                title={t.label}
              >
                {compact ? t.icon : `${t.icon} ${t.label}`}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-gray-200" />

          {/* Stroke size */}
          {tool === "pen" && (
            <div className="flex gap-1">
              {Object.entries(STROKE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setStrokeSize(preset.size)}
                  className={`rounded px-2 py-1 text-sm transition-colors ${
                    strokeSize === preset.size
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {compact ? key[0].toUpperCase() : preset.label}
                </button>
              ))}
            </div>
          )}

          {/* Colors */}
          {tool === "pen" && (
            <>
              <div className="h-5 w-px bg-gray-200" />
              <div className="flex gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setStrokeColor(c.value)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      strokeColor === c.value
                        ? "border-blue-500 scale-125"
                        : "border-gray-300"
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex-1" />

          {/* Actions */}
          <div className="flex gap-1">
            <button
              onClick={() => setStrokes((prev) => prev.slice(0, -1))}
              disabled={strokes.length === 0}
              className="rounded px-2 py-1 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30"
              title="되돌리기"
            >
              ↩
            </button>
            <button
              onClick={() => {
                setStrokes([]);
                setTexts([]);
              }}
              disabled={strokes.length === 0 && texts.length === 0}
              className="rounded px-2 py-1 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30"
              title="전체 지우기"
            >
              🗑
            </button>
          </div>
        </div>

        {/* Canvas — resizable */}
        <div
          className="relative overflow-hidden rounded-lg border bg-white"
          style={{ height: canvasHeight }}
        >
          <svg
            ref={svgRef}
            className="w-full h-full touch-none"
            style={{
              cursor: tool === "pen" ? "crosshair" : tool === "eraser" ? "cell" : "text",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <rect width="100%" height="100%" fill="white" />

            {/* Rendered strokes */}
            {strokes.map(renderStroke)}

            {/* Current stroke (while drawing) */}
            {renderCurrentStroke()}

            {/* Text elements */}
            {texts.map((t) => (
              <text
                key={t.id}
                x={t.x}
                y={t.y}
                fontSize="18"
                fontFamily="sans-serif"
                fill="#1a1a1a"
                className={editingText === t.id ? "opacity-50" : ""}
              >
                {t.text || (editingText === t.id ? "입력 중..." : "")}
              </text>
            ))}
          </svg>

          {/* Text input overlay */}
          {editingText && (
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t p-2 flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={texts.find((t) => t.id === editingText)?.text || ""}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTextDone()}
                placeholder="텍스트를 입력하세요..."
                className="flex-1 rounded border px-3 py-2 focus:border-blue-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleTextDone}
                className="rounded bg-blue-500 px-4 py-2 text-white text-sm"
              >
                확인
              </button>
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="flex items-center justify-center h-3 cursor-ns-resize bg-gray-100 hover:bg-gray-200 rounded-b-lg border border-t-0 transition-colors select-none"
          title="드래그하여 캔버스 크기 조절"
        >
          <div className="w-8 h-1 bg-gray-300 rounded-full" />
        </div>
      </div>
    );
  }
);

export default DrawingCanvas;
