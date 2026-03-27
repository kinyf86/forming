import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { getChapter, getSubjectLabel } from "@/lib/curriculum";
import { getGradeFromChapterId } from "@/lib/curriculum";

function subjectLabel(chapterId: string): { label: string; subject: string } {
  const grade = getGradeFromChapterId(chapterId);
  const isMath = chapterId.startsWith("math");
  return { label: getSubjectLabel(chapterId, grade), subject: isMath ? "math" : "science" };
}

export function buildBreadcrumb(opts: {
  chapterId?: string;
  problemSummary?: string;
}): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: "홈", href: "/" }];

  if (!opts.chapterId) return items;

  const { label } = subjectLabel(opts.chapterId);
  items.push({ label, href: "/" });

  const chapter = getChapter(opts.chapterId);
  if (chapter) {
    items.push({
      label: chapter.title,
      href: `/chapter/${opts.chapterId}`,
    });
  }

  if (opts.problemSummary) {
    items.push({ label: opts.problemSummary });
  }

  return items;
}
