import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ArrowLeft } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import SolveShell from "@/pages/solve/SolveShell.jsx";
import ProblemSolveCard from "@/components/solve/ProblemSolveCard.jsx";
import { getSolveProblem } from "@/api/solve.js";
import { resolveErrorMessage } from "@/api/client.js";

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
            <Link to="/solve/problems" className={""}>
              <Button variant="secondary" size="sm">목록으로</Button>
            </Link>
          </div>
        </Surface>
      </SolveShell>
    );
  }

  if (!problem) {
    return (
      <SolveShell>
        <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>
      </SolveShell>
    );
  }

  return (
    <SolveShell>
      <Link to="/solve/problems" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        문제 목록
      </Link>

      <ProblemSolveCard problem={problem} onSubmitted={setSubmittedResult} />

      {submittedResult && (
        <div className="mt-4">
          <Link to="/solve/problems">
            <Button variant="secondary" size="sm">다른 문제 풀기</Button>
          </Link>
        </div>
      )}
    </SolveShell>
  );
}
