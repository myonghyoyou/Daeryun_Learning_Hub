import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { MagnifyingGlass, ArrowRight } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Select from "@/components/ui/Select.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import SolveShell from "@/pages/solve/SolveShell.jsx";
import { listSolveProblems } from "@/api/solve.js";
import { listTagsInUse } from "@/api/problems.js";
import { resolveErrorMessage } from "@/api/client.js";
import { previewContent } from "@/utils/problemPreview.js";

const TYPE_LABELS = {
  MCQ_SINGLE: "객관식(단일)",
  MCQ_MULTI: "객관식(다중)",
  OX: "OX",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸 채우기",
};

export default function SolveProblemListPage() {
  const [problems, setProblems] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    listTagsInUse()
      .then((rows) => setTags(rows.map((item) => (item.name ?? item))))
      .catch(() => setTags([]));
  }, []);

  async function refresh() {
    setLoading(true);
    setError(false);
    try {
      setProblems(await listSolveProblems(keyword, tag));
    } catch (err) {
      setError(true);
      toast.error(resolveErrorMessage(err, "문제 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SolveShell>
      <section className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">문제 풀이</h1>
        <Link to="/solve/history" className="rounded-sm text-body-small font-semibold text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
          내 풀이 이력
        </Link>
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          refresh();
        }}
        className="mb-5 flex flex-wrap items-end gap-2"
      >
        <Input
          id="solve-keyword"
          label="검색"
          className="min-w-[200px] flex-1"
          placeholder="문제 내용 검색"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Select
          id="solve-tag"
          label="태그"
          className="min-w-[160px]"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          options={[{ value: "", label: "전체 태그" }, ...tags.map((name) => ({ value: name, label: name }))]}
        />
        <Button type="submit" size="md">
          <MagnifyingGlass size={16} aria-hidden="true" />
          검색
        </Button>
      </form>

      {loading ? (
        <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>
      ) : error ? (
        <Surface className="p-0">
          <EmptyState
            title="문제를 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
            action={<Button variant="secondary" size="sm" onClick={refresh}>다시 시도</Button>}
          />
        </Surface>
      ) : problems.length === 0 ? (
        <Surface className="p-0">
          <EmptyState title="조건에 맞는 문제가 없습니다." description="검색어나 태그를 바꿔 보세요." />
        </Surface>
      ) : (
        <ul className="space-y-2">
          {problems.map((problem) => (
            <li key={problem.id}>
              <Surface as={Link} to={`/solve/${problem.id}`} className="group flex items-center gap-3 p-4 transition-shadow hover:shadow-raised focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
                <span className="shrink-0 rounded-full bg-surface-blue px-2.5 py-1 text-body-small font-medium text-info-text">
                  {TYPE_LABELS[problem.type] ?? problem.type}
                </span>
                <span className="line-clamp-2 flex-1 text-body text-ink-strong">{previewContent(problem.content)}</span>
                <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </SolveShell>
  );
}
