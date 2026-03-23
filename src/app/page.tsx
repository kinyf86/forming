import Link from "next/link";
import { getChaptersBySubject } from "@/lib/curriculum";

export default function Home() {
  const mathSemesters = getChaptersBySubject("math");
  const scienceSemesters = getChaptersBySubject("science");

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">Forming</h1>
      <p className="mb-8 text-gray-600">
        초등학교 6학년 교육과정 · 학습할 단원을 선택해주세요.
      </p>

      {/* 수학 */}
      <section className="mb-10">
        <h2 className="mb-4 text-2xl font-bold text-blue-700">수학</h2>
        {mathSemesters.map((sem) => (
          <div key={sem.semester} className="mb-6">
            <h3 className="mb-3 text-lg font-semibold text-gray-700">
              {sem.semester}학기
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sem.chapters.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/chapter/${ch.id}`}
                  className="rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="text-sm text-blue-500">
                    {ch.chapter}단원
                  </span>
                  <h4 className="mt-1 text-lg font-semibold">{ch.title}</h4>
                  <p className="mt-2 text-sm text-gray-400">
                    {ch.concepts.length}개 개념
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* 과학 */}
      <section>
        <h2 className="mb-4 text-2xl font-bold text-green-700">과학</h2>
        {scienceSemesters.map((sem) => (
          <div key={sem.semester} className="mb-6">
            <h3 className="mb-3 text-lg font-semibold text-gray-700">
              {sem.semester}학기
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sem.chapters.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/chapter/${ch.id}`}
                  className="rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="text-sm text-green-500">
                    {ch.chapter}단원
                  </span>
                  <h4 className="mt-1 text-lg font-semibold">{ch.title}</h4>
                  <p className="mt-2 text-sm text-gray-400">
                    {ch.concepts.length}개 개념
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
