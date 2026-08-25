import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { ArrowLeft } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Select from "@/components/ui/Select.jsx";
import Button from "@/components/ui/Button.jsx";
import SolveShell from "@/screens/solve/SolveShell.jsx";
import { fetchRandomSet } from "@/apiClient/solve.js";
import { listDepartmentOptions } from "@/apiClient/departments.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { createSession, SESSION_STORAGE_KEY } from "@/utils/solveSession.js";

const COUNT_OPTIONS = [
  { value: "5", label: "5문제" },
  { value: "10", label: "10문제" },
  { value: "20", label: "20문제" },
  { value: "50", label: "50문제" },
];

/**
 * 랜덤 풀이 설정 화면. 문제 수와 부서를 정해 무작위 세트를 시작한다.
 * 부서는 접근 제한이 아니라 사용자가 고르는 필터다(D1) — 기본값은 "전체 부서"이고,
 * 로그인한 사용자의 부서를 자동으로 선택하거나 그 부서로 제한하지 않는다.
 */
export default function RandomSetupPage() {
  const navigate = useNavigate();
  const [count, setCount] = useState("10");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    listDepartmentOptions()
      .then(setDepartments)
      .catch((error) => toast.error(resolveErrorMessage(error, "부서 목록을 불러오지 못했습니다.")));
  }, []);

  async function handleStart() {
    setStarting(true);
    try {
      const problems = await fetchRandomSet(Number(count), departmentId || null);
      if (problems.length === 0) {
        toast.info("조건에 맞는 문제가 없습니다. 부서나 문제 수를 바꿔 보세요.");
        return;
      }
      const session = createSession(problems);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      navigate("/solve/random/play");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "문제를 불러오지 못했습니다."));
    } finally {
      setStarting(false);
    }
  }

  return (
    <SolveShell>
      <Link to="/solve" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        학습 홈
      </Link>

      <section className="mb-6">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">랜덤으로 풀기</h1>
        <p className="mt-1 text-body text-ink-default">문제 수와 부서를 정하면 무작위로 뽑아 드립니다.</p>
      </section>

      <Surface className="max-w-md p-5">
        <div className="flex flex-col gap-4">
          <Select
            id="random-count"
            label="문제 수"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            options={COUNT_OPTIONS}
          />
          <Select
            id="random-department"
            label="부서"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            options={[
              { value: "", label: "전체 부서" },
              ...departments.map((department) => ({ value: String(department.id), label: department.name })),
            ]}
          />
          <Button type="button" size="md" loading={starting} onClick={handleStart}>
            시작하기
          </Button>
        </div>
      </Surface>
    </SolveShell>
  );
}
