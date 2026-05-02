"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import SvgRenderer from "@/components/ui/SvgRenderer";
import StepIndicator from "./StepIndicator";
import type { LessonContent } from "@/lib/lessons";

interface TutorLessonProps {
  chapterTitle: string;
  concepts: string[];
  lessons: LessonContent[];
  onComplete: () => void;
}

type LessonState = "explaining" | "question" | "correct" | "wrong";

export default function TutorLesson({
  chapterTitle,
  concepts,
  lessons,
  onComplete,
}: TutorLessonProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [lessonState, setLessonState] = useState<LessonState>("explaining");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const lesson = lessons[currentStep];

  const handleAnswer = (optionIndex: number) => {
    setSelectedOption(optionIndex);
    if (lesson && optionIndex === lesson.checkQuestion.correctIndex) {
      setLessonState("correct");
    } else {
      setLessonState("wrong");
    }
  };

  const handleNext = () => {
    const nextStep = currentStep + 1;
    if (nextStep >= lessons.length) {
      onComplete();
    } else {
      setCurrentStep(nextStep);
      setLessonState("explaining");
      setSelectedOption(null);
    }
  };

  const handleRetry = () => {
    setSelectedOption(null);
    setLessonState("explaining");
  };

  if (!lesson) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <StepIndicator
        current={currentStep}
        total={concepts.length}
        concepts={concepts}
      />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        {/* Header */}
        <div className="mb-6">
          <p className="text-sm text-blue-500 font-medium mb-1">
            {chapterTitle}
          </p>
          <h2 className="text-2xl font-bold text-gray-800">
            {lesson.concept}
          </h2>
        </div>

        {/* Visual SVG */}
        <div className="mb-6 bg-gray-50 rounded-xl p-4">
          <SvgRenderer
            svg={lesson.visualSvg}
            fallbackText="시각 자료가 없습니다."
          />
        </div>

        {/* Text Explanation */}
        <div className="prose prose-lg max-w-none mb-8">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {lesson.explanation}
          </ReactMarkdown>
        </div>

        {/* Show question button or question */}
        {lessonState === "explaining" && (
          <button
            onClick={() => setLessonState("question")}
            className="w-full py-4 bg-blue-500 text-white text-lg font-bold rounded-xl hover:bg-blue-600 transition-colors"
          >
            이해했어요! 확인 문제 풀기
          </button>
        )}

        {/* Check Question */}
        {(lessonState === "question" ||
          lessonState === "correct" ||
          lessonState === "wrong") && (
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-lg font-bold text-gray-700 mb-4">
              확인 문제
            </h3>
            <div className="text-gray-800 mb-4 text-lg prose prose-lg max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {lesson.checkQuestion.question}
              </ReactMarkdown>
            </div>

            <div className="grid gap-3">
              {lesson.checkQuestion.options.map((option, i) => {
                let buttonStyle =
                  "border-gray-200 hover:border-blue-300 hover:bg-blue-50";
                if (selectedOption !== null) {
                  if (i === lesson.checkQuestion.correctIndex) {
                    buttonStyle =
                      "border-green-500 bg-green-50 text-green-700";
                  } else if (i === selectedOption) {
                    buttonStyle = "border-red-400 bg-red-50 text-red-600";
                  } else {
                    buttonStyle = "border-gray-200 opacity-50";
                  }
                }

                return (
                  <button
                    key={i}
                    onClick={() =>
                      selectedOption === null && handleAnswer(i)
                    }
                    disabled={selectedOption !== null}
                    className={`p-4 text-left rounded-xl border-2 text-lg transition-all ${buttonStyle}`}
                  >
                    <span className="font-bold mr-3 text-gray-400">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <span className="inline-prose">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          p: ({ children }) => <>{children}</>,
                        }}
                      >
                        {option}
                      </ReactMarkdown>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Correct */}
            {lessonState === "correct" && (
              <div className="mt-6 text-center">
                <p className="text-2xl mb-2">🎉</p>
                <p className="text-green-600 font-bold text-lg mb-4">
                  정답이에요! 잘했어요!
                </p>
                <button
                  onClick={handleNext}
                  className="px-8 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition-colors text-lg"
                >
                  {currentStep + 1 >= lessons.length
                    ? "수업 완료! 문제 풀러 가기"
                    : "다음 개념으로"}
                </button>
              </div>
            )}

            {/* Wrong */}
            {lessonState === "wrong" && (
              <div className="mt-6 text-center">
                <p className="text-xl mb-2">🤔</p>
                <p className="text-orange-600 font-bold mb-4">
                  아쉬워요! 정답은{" "}
                  <span className="text-green-600">
                    {String.fromCharCode(
                      65 + lesson.checkQuestion.correctIndex
                    )}
                  </span>
                  번이에요.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleRetry}
                    className="px-6 py-3 border-2 border-blue-300 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors"
                  >
                    다시 설명 보기
                  </button>
                  <button
                    onClick={handleNext}
                    className="px-6 py-3 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors"
                  >
                    {currentStep + 1 >= lessons.length
                      ? "문제 풀러 가기"
                      : "다음 개념으로"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
