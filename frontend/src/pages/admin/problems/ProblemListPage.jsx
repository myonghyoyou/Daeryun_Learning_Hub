import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { CaretDown, CaretUp, Plus } from "@phosphor-icons/react";
import { archiveProblem, listProblems, listTags } from "@/api/problems.js";
import { resolveErrorMessage } from "@/api/client.js";
import { EMPTY_PROBLEM_FILTERS, buildProblemListParams } from "@/utils/problemListParams.js";
import { PROBLEM_STATUS_OPTIONS, PROBLEM_TYPE_OPTIONS, problemStatusLabel, problemTypeLabel } from "@/utils/problemLabels.js";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Select from "@/components/ui/Select.jsx";
import StatusBadge from "@/components/ui/StatusBadge.jsx";
import DataTable, { TableRow, TableCell } from "@/components/ui/DataTable.jsx";
import ListStateSurface from "@/components/admin/ListStateSurface.jsx";
import ConfirmToggleModal from "@/components/admin/ConfirmToggleModal.jsx";

export default function ProblemListPage() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [tags, setTags] = useState([]);
  const [filters, setFilters] = useState(EMPTY_PROBLEM_FILTERS);
  // 8.7: 태그·등록일 필터는 기본 화면에서 공간을 차지하지 않도록 "상세 필터" 뒤에 숨긴다
  // (9.2.2 모바일 문제 목록의 상세 필터 규칙을 관리자 화면에도 적용).
  const [detailFiltersOpen, setDetailFiltersOpen] = useState(false);

  // 보관 확인 Modal 대상. null이면 닫힌 상태다.
  const [pendingArchive, setPendingArchive] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  async function refresh(nextFilters = filters) {
    setLoading(true);
    setLoadError(null);
    try {
      setProblems(await listProblems(buildProblemListParams(nextFilters)));
    } catch (error) {
      const message = resolveErrorMessage(error, "문제 목록을 불러오지 못했습니다.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    listTags().then(setTags).catch(() => setTags([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterChange(field) {
    return (event) => {
      const { value } = event.target;
      setFilters((prev) => ({ ...prev, [field]: value }));
    };
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    refresh(filters);
  }

  function handleResetFilters() {
    setFilters(EMPTY_PROBLEM_FILTERS);
    refresh(EMPTY_PROBLEM_FILTERS);
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    setArchivingId(pendingArchive.id);
    try {
      await archiveProblem(pendingArchive.id);
      toast.success("문제가 보관 처리되었습니다.");
      setPendingArchive(null);
      await refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "문제 보관에 실패했습니다."));
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">문제 관리</h1>
          <p className="mt-1 text-body-small text-ink-muted">문제를 등록·수정하고 상태를 관리합니다.</p>
        </div>
        {/* Link는 Button 컴포넌트를 감쌀 수 없어(버튼은 폴리모픽하지 않다) primary 버튼과
            동일한 시각 스타일을 직접 적용한다 — 페이지 헤더의 유일한 Primary Action이다. */}
        <Link
          to="/admin/problems/new"
          className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-sm bg-action-primary-bg px-4 text-body-small font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
        >
          <Plus size={16} aria-hidden="true" />
          문제 등록
        </Link>
      </div>

      {/* 8.7 FilterPanel: 필터마다 별도 카드로 만들지 않고 Surface 하나로 묶는다. */}
      <Surface className="p-5">
        <form onSubmit={handleSearchSubmit} noValidate>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              id="problem-search"
              label="검색"
              placeholder="문제 내용으로 검색"
              value={filters.keyword}
              onChange={handleFilterChange("keyword")}
              className="w-full sm:w-72"
            />
            <Select
              id="problem-type-filter"
              label="유형"
              value={filters.type}
              onChange={handleFilterChange("type")}
              options={PROBLEM_TYPE_OPTIONS}
              className="w-40"
            />
            <Select
              id="problem-status-filter"
              label="상태"
              value={filters.status}
              onChange={handleFilterChange("status")}
              options={PROBLEM_STATUS_OPTIONS}
              className="w-36"
            />
            <Button type="submit">조회</Button>
            <Button
              type="button"
              variant="secondary"
              aria-expanded={detailFiltersOpen}
              aria-controls="problem-detail-filters"
              onClick={() => setDetailFiltersOpen((prev) => !prev)}
            >
              상세 필터
              {detailFiltersOpen ? (
                <CaretUp size={16} aria-hidden="true" />
              ) : (
                <CaretDown size={16} aria-hidden="true" />
              )}
            </Button>
          </div>

          {detailFiltersOpen && (
            <div id="problem-detail-filters" className="mt-3 flex flex-wrap items-end gap-3 border-t border-line-default pt-3">
              <Input
                id="problem-created-from"
                type="date"
                label="등록일 시작"
                value={filters.createdFrom}
                onChange={handleFilterChange("createdFrom")}
                className="w-full sm:w-44"
              />
              <Input
                id="problem-created-to"
                type="date"
                label="등록일 종료"
                value={filters.createdTo}
                onChange={handleFilterChange("createdTo")}
                className="w-full sm:w-44"
              />
              <Select
                id="problem-tag-filter"
                label="태그"
                value={filters.tag}
                onChange={handleFilterChange("tag")}
                options={[
                  { value: "", label: "전체 태그" },
                  ...tags.map((item) => ({ value: item.name ?? item, label: item.name ?? item })),
                ]}
                className="w-48"
              />
              <Button type="button" variant="secondary" onClick={handleResetFilters}>
                초기화
              </Button>
            </div>
          )}
        </form>
      </Surface>

      {!loading && !loadError && <p className="text-body-small text-ink-muted">전체 {problems.length}건</p>}

      <ListStateSurface
        loading={loading}
        loadingMessage="문제 목록을 불러오는 중입니다..."
        error={loadError}
        onRetry={() => refresh()}
        isEmpty={problems.length === 0}
        emptyTitle={
          Object.entries(buildProblemListParams(filters)).some(([, value]) => value !== undefined)
            ? "조건에 맞는 문제가 없습니다."
            : "등록된 문제가 없습니다."
        }
        emptyDescription="검색어 또는 필터 조건을 확인하거나, 위 버튼으로 새 문제를 등록하세요."
      >
        <DataTable
          ariaLabel="문제 목록"
          columns={[
            { key: "type", label: "유형" },
            { key: "content", label: "내용" },
            { key: "department", label: "부서" },
            { key: "status", label: "상태" },
            { key: "tags", label: "태그" },
            { key: "actions", label: "관리" },
          ]}
        >
          {problems.map((problem) => (
            <TableRow key={problem.id}>
              <TableCell>{problemTypeLabel(problem.type)}</TableCell>
              <TableCell className="max-w-xs truncate" title={problem.content}>
                {problem.content}
              </TableCell>
              <TableCell>{problem.departmentName}</TableCell>
              <TableCell>
                <StatusBadge status={problem.status} label={problemStatusLabel(problem.status)} />
              </TableCell>
              <TableCell>{problem.tags?.join(", ")}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Link
                    to={`/admin/problems/${problem.id}/edit`}
                    className="inline-flex h-8 items-center rounded-sm border border-line-strong px-3 text-[11px] font-semibold text-action-secondary-text hover:bg-surface-subtle"
                  >
                    수정
                  </Link>
                  <Button type="button" variant="destructive" size="sm" onClick={() => setPendingArchive(problem)}>
                    보관
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </ListStateSurface>

      <ConfirmToggleModal
        open={Boolean(pendingArchive)}
        pendingId={pendingArchive?.id}
        togglingId={archivingId}
        title="문제 보관"
        message={
          pendingArchive && (
            <>
              <span className="font-semibold text-ink-strong">{pendingArchive.content}</span> 문제를 보관합니다.
              보관된 문제는 학습 화면에서 더 이상 노출되지 않지만 완전히 삭제되지는 않으며, 기존 풀이 이력도 그대로
              보존됩니다.
            </>
          )
        }
        confirmLabel="보관 확정"
        confirmVariant="destructive"
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
