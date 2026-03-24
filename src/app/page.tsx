import Link from "next/link";
import { getChaptersBySubjectAndGrade, getCurricula } from "@/lib/curriculum";
import { getProblemsByTopic } from "@/lib/problems";

const SUBJECT_CONFIG = {
  math: { label: "수학", color: "blue" },
  science: { label: "과학", color: "green" },
} as const;

export default function Home() {
  const curricula = getCurricula();

  // Group by subject then grade
  const grouped: Record<string, { grade: number; semesters: ReturnType<typeof getChaptersBySubjectAndGrade> }[]> = {};
  for (const c of curricula) {
    if (!grouped[c.subject]) grouped[c.subject] = [];
    grouped[c.subject].push({
      grade: c.grade,
      semesters: c.semesters as ReturnType<typeof getChaptersBySubjectAndGrade>,
    });
  }

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">Forming</h1>
      <p className="mb-8 text-gray-600">
        학습할 단원을 선택해주세요.
      </p>

      {Object.entries(grouped).map(([subject, grades]) => {
        const config = SUBJECT_CONFIG[subject as keyof typeof SUBJECT_CONFIG];
        if (!config) return null;

        return (
          <section key={subject} className="mb-10">
            <h2 className={`mb-4 text-2xl font-bold text-${config.color}-700`}>
              {config.label}
            </h2>

            {grades
              .sort((a, b) => a.grade - b.grade)
              .map(({ grade, semesters }) => (
                <div key={grade} className="mb-8">
                  <h3 className="mb-4 rounded-lg bg-gray-100 px-4 py-2 text-lg font-bold text-gray-800">
                    {grade}학년
                  </h3>

                  {semesters.map((sem) => (
                    <div key={sem.semester} className="mb-6">
                      <h4 className="mb-3 text-base font-semibold text-gray-600">
                        {sem.semester}학기
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {sem.chapters.map((ch) => {
                          const problemCount = getProblemsByTopic(ch.id).length;
                          return (
                            <Link
                              key={ch.id}
                              href={`/chapter/${ch.id}`}
                              className="rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                            >
                              <span className={`text-sm text-${config.color}-500`}>
                                {ch.chapter}단원
                              </span>
                              <h5 className="mt-1 text-lg font-semibold">
                                {ch.title}
                              </h5>
                              <p className="mt-2 text-sm text-gray-400">
                                {ch.concepts.length}개 개념
                                {problemCount > 0 && ` · 문제 ${problemCount}개`}
                              </p>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
