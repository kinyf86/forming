import Link from "next/link";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";
import { getTopic, getProblemsByTopic } from "@/lib/problems";
import { TheoryContent } from "@/components/theory/TheoryContent";

export default async function TheoryPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const topic = getTopic(topicId);
  if (!topic) notFound();

  const theoryPath = path.join(
    process.cwd(),
    "src/data/theories",
    topic.theoryFile
  );
  const theoryContent = fs.readFileSync(theoryPath, "utf-8");
  const problems = getProblemsByTopic(topicId);

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          &larr; 주제 목록
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-8 shadow-sm">
        <TheoryContent content={theoryContent} />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">문제 풀기</h2>
        <div className="grid gap-3">
          {problems.map((problem, index) => (
            <Link
              key={problem.id}
              href={`/problem/${problem.id}`}
              className="flex items-center justify-between rounded-lg border bg-white px-6 py-4 transition-shadow hover:shadow-md"
            >
              <span>
                문제 {index + 1}
                <span className="ml-3 text-sm text-gray-500">
                  난이도 {"★".repeat(problem.difficulty)}
                </span>
              </span>
              <span className="text-blue-600">&rarr;</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
