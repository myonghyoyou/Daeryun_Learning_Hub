import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ArrowLeft } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import SolveShell from "@/pages/solve/SolveShell.jsx";
import ProblemSolveCard from "@/components/solve/ProblemSolveCard.jsx";
import ProblemSkeleton from "@/components/solve/ProblemSkeleton.jsx";
import { getSolveProblem } from "@/api/solve.js";
import { resolveErrorMessage } from "@/api/client.js";
import { buttonClass } from "@/utils/buttonClass.js";

export default function ProblemSolvePage() {
  const { id } = useParams();
  const [problem, setProblem] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [submittedResult, setSubmittedResult] = useState(null);

  useEffect(() => {
    setProblem(null);
    setLoadError(false);
    setSubmittedResult(null);
    getSolveProblem(id)
      .then(setProblem)
      .catch((error) => {
        setLoadError(true);
        toast.error(resolveErrorMessage(error, "문제를 불러오지 못했습니다."));
      });
  }, [id]);

  if (loadError) {
    return (
      <SolveShell>
        <Surface className="p-0">
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-body font-semibold text-ink-strong">문제를 불러오지 못했습니다.</p>
            <Link to="/solve/problems" className={buttonClass({ variant: "secondary", size: "sm" })}>
              목록으로
            </Link>
          </div>
        </Surface>
      </SolveShell>
    );
  }

  // 로딩 중에도 "문제 목록" 링크를 같은 자리에 그린다. skeleton 만 그리면 로드가 끝나는
  // 순간 링크(높이 20px + mb-4)가 새로 끼어들어 카드가 통째로 36px 아래로 밀린다 —
  // skeleton 이 막으려던 바로 그 현상이다. 랜덤 세트 진행 화면도 같은 이유로 진행률
  // 헤더를 skeleton 상태에서 함께 그린다(RandomPlayPage).
  return (
    <SolveShell>
      <Link to="/solve/problems" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        문제 목록
      </Link>

      {problem ? (
        <>
          <ProblemSolveCard problem={problem} onSubmitted={setSubmittedResult} />

          {submittedResult && (
            <div className="mt-4">
              <Link to="/solve/problems" className={buttonClass({ variant: "secondary", size: "sm" })}>
                다른 문제 풀기
              </Link>
            </div>
          )}
        </>
      ) : (
        <ProblemSkeleton />
      )}
    </SolveShell>
  );
}
