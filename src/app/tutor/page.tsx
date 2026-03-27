import TutorChatClient from "./TutorChatClient";
import { buildCurriculumChips } from "@/lib/tutor-prompts";

export default function TutorPage() {
  const chips = buildCurriculumChips();
  return <TutorChatClient chips={chips} />;
}
