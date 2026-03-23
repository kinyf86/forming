import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { getChapter } from "@/lib/curriculum";

function subjectLabel(chapterId: string): { label: string; subject: string } {
  if (chapterId.startsWith("math")) return { label: "초등6수학", subject: "math" };
  if (chapterId.startsWith("sci")) return { label: "초등6과학", subject: "science" };
  return { label: "학습", subject: "" };
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
