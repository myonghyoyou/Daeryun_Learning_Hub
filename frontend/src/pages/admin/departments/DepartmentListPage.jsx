import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Plus } from "@phosphor-icons/react";
import { createDepartment, listDepartments, updateDepartment } from "@/api/departments.js";
import { resolveErrorMessage } from "@/api/client.js";
import { filterDepartments } from "@/utils/departmentFilters.js";
import { validateDepartmentForm } from "@/utils/departmentValidation.js";
import { canDismissConfirmModal } from "@/utils/modalDismissal.js";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Select from "@/components/ui/Select.jsx";
import StatusBadge from "@/components/ui/StatusBadge.jsx";
import DataTable, { TableRow, TableCell } from "@/components/ui/DataTable.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import Modal from "@/components/ui/Modal.jsx";

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "전체 상태" },
  { value: "ACTIVE", label: "활성" },
  { value: "INACTIVE", label: "비활성" },
];

const EMPTY_FORM = { name: "", code: "" };

export default function DepartmentListPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [creating, setCreating] = useState(false);

  // 비활성화/활성화 확인 Modal 대상. null이면 닫힌 상태다.
  const [pendingToggle, setPendingToggle] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  async function refresh() {
    setLoading(true);
    setLoadError(null);
    try {
      setDepartments(await listDepartments());
    } catch (error) {
      const message = resolveErrorMessage(error, "부서 목록을 불러오지 못했습니다.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filteredDepartments = useMemo(
    () => filterDepartments(departments, { keyword, status: statusFilter }),
    [departments, keyword, statusFilter],
  );

  function handleFieldChange(field) {
    return (event) => {
      const { value } = event.target;
      setForm((prev) => ({ ...prev, [field]: value }));
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  async function handleCreate(event) {
    event.preventDefault();
    const errors = validateDepartmentForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setCreating(true);
    try {
      await createDepartment({ name: form.name.trim(), code: form.code.trim() });
      setForm(EMPTY_FORM);
      toast.success("부서가 생성되었습니다.");
      await refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "부서 생성에 실패했습니다."));
    } finally {
      setCreating(false);
    }
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    const nextStatus = pendingToggle.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setTogglingId(pendingToggle.id);
    try {
      await updateDepartment(pendingToggle.id, { name: pendingToggle.name, status: nextStatus });
      toast.success(nextStatus === "INACTIVE" ? "부서가 비활성화되었습니다." : "부서가 활성화되었습니다.");
      setPendingToggle(null);
      await refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "부서 상태 변경에 실패했습니다."));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">부서 관리</h1>
        <p className="mt-1 text-body-small text-ink-muted">부서를 생성하고 상태를 관리합니다.</p>
      </div>

      {/* 8.10: 상단에는 검색·상태 필터·생성 버튼만 둔다. */}
      <Surface className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            id="department-search"
            label="검색"
            placeholder="부서명 또는 코드로 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="w-full sm:w-72"
          />
          <Select
            id="department-status-filter"
            label="상태"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={STATUS_FILTER_OPTIONS}
            className="w-40"
          />
        </div>
      </Surface>

      <Surface className="p-5">
        <h2 className="text-section-title font-bold text-ink-strong">부서 생성</h2>
        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
          <Input
            id="department-name"
            label="부서명"
            required
            value={form.name}
            onChange={handleFieldChange("name")}
            error={formErrors.name}
            className="w-full sm:w-60"
          />
          <Input
            id="department-code"
            label="부서 코드"
            required
            value={form.code}
            onChange={handleFieldChange("code")}
            error={formErrors.code}
            className="w-full sm:w-60"
          />
          <Button type="submit" loading={creating}>
            <Plus size={16} aria-hidden="true" />
            부서 생성
          </Button>
        </form>
      </Surface>

      <Surface>
        <div aria-live="polite">
          {loading ? (
            <p className="px-5 py-10 text-center text-body-small text-ink-muted">부서 목록을 불러오는 중입니다...</p>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="text-body-small text-danger-text">{loadError}</p>
              <Button variant="secondary" size="sm" onClick={refresh}>
                다시 시도
              </Button>
            </div>
          ) : filteredDepartments.length === 0 ? (
            <EmptyState
              title={departments.length === 0 ? "등록된 부서가 없습니다." : "조건에 맞는 부서가 없습니다."}
              description={
                departments.length === 0
                  ? "위 양식으로 첫 부서를 생성하세요."
                  : "검색어 또는 상태 필터를 확인해 주세요."
              }
            />
          ) : (
            <DataTable
              ariaLabel="부서 목록"
              columns={[
                { key: "name", label: "부서명" },
                { key: "code", label: "코드" },
                { key: "status", label: "상태" },
                { key: "actions", label: "관리" },
              ]}
            >
              {filteredDepartments.map((department) => (
                <TableRow key={department.id}>
                  <TableCell className="font-medium text-ink-strong">{department.name}</TableCell>
                  <TableCell>{department.code}</TableCell>
                  <TableCell>
                    <StatusBadge status={department.status} />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant={department.status === "ACTIVE" ? "destructive" : "secondary"}
                      size="sm"
                      onClick={() => setPendingToggle(department)}
                    >
                      {department.status === "ACTIVE" ? "비활성화" : "활성화"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
        </div>
      </Surface>

      <Modal
        open={Boolean(pendingToggle)}
        title={pendingToggle?.status === "ACTIVE" ? "부서 비활성화" : "부서 활성화"}
        onClose={() => setPendingToggle(null)}
        dismissible={canDismissConfirmModal({ pendingId: pendingToggle?.id, togglingId })}
      >
        {pendingToggle && (
          <div className="space-y-4">
            <p className="text-body text-ink-default">
              <span className="font-semibold text-ink-strong">{pendingToggle.name}</span>
              {pendingToggle.status === "ACTIVE"
                ? " 부서를 비활성화합니다. 이 부서는 비활성 상태로 전환되며, 필요하면 다시 활성화할 수 있습니다."
                : " 부서를 다시 활성화합니다."}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={togglingId === pendingToggle.id}
                onClick={() => setPendingToggle(null)}
              >
                취소
              </Button>
              <Button
                variant={pendingToggle.status === "ACTIVE" ? "destructive" : "primary"}
                loading={togglingId === pendingToggle.id}
                onClick={confirmToggle}
              >
                {pendingToggle.status === "ACTIVE" ? "비활성화 확정" : "활성화 확정"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
