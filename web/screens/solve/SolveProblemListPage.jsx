import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { MagnifyingGlass, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Select from "@/components/ui/Select.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import SourceBadge from "@/components/ui/SourceBadge.jsx";
import { listSolveProblems } from "@/apiClient/solve.js";
import { listTagsInUse } from "@/apiClient/problems.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { previewContent } from "@/utils/problemPreview.js";
import { problemTypeLabel } from "@/utils/problemLabels.js";

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

  async function refresh({ keyword: nextKeyword = keyword, tag: nextTag = tag } = {}) {
    setLoading(true);
    setError(false);
    try {
      setProblems(await listSolveProblems(nextKeyword, nextTag));
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
    <>
      <Link href="/solve" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        학습 홈
      </Link>

      <section className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">문제 풀이</h1>
        <Link href="/solve/history" className="rounded-sm text-body-small font-semibold text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
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
          <EmptyState
            title="조건에 맞는 문제가 없습니다."
            description="검색어나 태그를 바꿔 보세요."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setKeyword("");
                  setTag("");
                  refresh({ keyword: "", tag: "" });
                }}
              >
                필터 초기화
              </Button>
            }
          />
        </Surface>
      ) : (
        // overflow-hidden 이 없으면 첫/마지막 행의 hover 배경이 Surface 의 rounded-lg
        // 모서리 밖으로 사각형으로 새어 나온다. 행 포커스 링은 outline-offset 이 음수라
        // 행 안쪽에 그려지므로 이 클리핑에 걸리지 않는다.
        <Surface className="overflow-hidden p-0">
          <ul>
            {problems.map((problem) => (
              <li key={problem.id} className="border-b border-line-default last:border-b-0">
                <Link
                  href={`/solve/${problem.id}`}
                  className="group flex items-center gap-3 p-4 transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-aqua"
                >
                  <span className="shrink-0 rounded-full bg-surface-blue px-2.5 py-1 text-body-small font-medium text-info-text">
                    {problemTypeLabel(problem.type)}
                  </span>
                  <SourceBadge item={problem} />
                  <span className="line-clamp-2 flex-1 text-body text-ink-strong">{previewContent(problem.content)}</span>
                  {problem.tags?.length > 0 && (
                    <span className="hidden shrink-0 gap-1 sm:flex">
                      {problem.tags.slice(0, 2).map((tagName) => (
                        <span key={tagName} className="rounded-xs bg-surface-subtle px-2 py-0.5 text-body-small text-ink-muted">
                          {tagName}
                        </span>
                      ))}
                    </span>
                  )}
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </>
  );
}
