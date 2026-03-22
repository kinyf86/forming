import Link from "next/link";
import topics from "@/data/topics.json";

export default function Home() {
  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">학습 주제 선택</h1>
      <p className="mb-8 text-gray-600">학습할 주제를 선택해주세요.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {topics.map((topic) => (
          <Link
            key={topic.id}
            href={`/theory/${topic.id}`}
            className="rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="mb-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              {topic.subject === "math" ? "수학" : "과학"} · {topic.grade}학년
            </span>
            <h2 className="text-xl font-semibold">{topic.title}</h2>
            <p className="mt-2 text-sm text-gray-500">
              문제 {topic.problemIds.length}개
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
