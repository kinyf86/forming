import { notFound } from "next/navigation";
import { getChapter } from "@/lib/curriculum";
import { buildBreadcrumb } from "@/lib/breadcrumb";
import { ChapterClient } from "./ChapterClient";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const { chapterId } = await params;
  const chapter = getChapter(chapterId);
  if (!chapter) notFound();

  const subject = chapterId.startsWith("math") ? "수학" : "과학";
  const breadcrumb = buildBreadcrumb({ chapterId });

  return <ChapterClient chapter={chapter} subject={subject} breadcrumb={breadcrumb} />;
}
