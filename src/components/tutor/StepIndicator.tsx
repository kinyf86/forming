"use client";

interface StepIndicatorProps {
  current: number;
  total: number;
  concepts: string[];
}

export default function StepIndicator({
  current,
  total,
  concepts,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-all ${
              i < current
                ? "bg-green-500 text-white"
                : i === current
                  ? "bg-blue-500 text-white scale-110"
                  : "bg-gray-200 text-gray-500"
            }`}
            title={concepts[i]}
          >
            {i < current ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`w-8 h-0.5 ${i < current ? "bg-green-500" : "bg-gray-200"}`}
            />
          )}
        </div>
      ))}
      <span className="ml-3 text-sm text-gray-500">
        {current + 1} / {total}
      </span>
    </div>
  );
}
