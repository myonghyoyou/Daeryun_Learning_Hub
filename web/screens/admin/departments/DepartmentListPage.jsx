import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Plus } from "@phosphor-icons/react";
import { createDepartment, listDepartments, updateDepartment } from "@/apiClient/departments.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { filterDepartments } from "@/utils/departmentFilters.js";
import { validateDepartmentEditForm, validateDepartmentForm } from "@/utils/departmentValidation.js";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Select from "@/components/ui/Select.jsx";
import StatusBadge from "@/components/ui/StatusBadge.jsx";
import DataTable, { TableRow, TableCell } from "@/components/ui/DataTable.jsx";
import Modal from "@/components/ui/Modal.jsx";
import ListStateSurface from "@/components/admin/ListStateSurface.jsx";
import Pagination from "@/components/ui/Pagination.jsx";
import { PAGE_SIZE, clampPage, pageSlice } from "@/utils/pagination.js";
import ConfirmToggleModal from "@/components/admin/ConfirmToggleModal.jsx";

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "전체 상태" },
  { value: "ACTIVE", label: "활성" },
  { value: "INACTIVE", label: "비활성" },
];

const EMPTY_FORM = { name: "", code: "" };
const EMPTY_EDIT_FORM = { name: "" };

export default function DepartmentListPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [creating, setCreating] = useState(false);

  // 수정 대상. null이면 Modal이 닫힌 상태다.
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editFormErrors, setEditFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

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

  const [page, setPage] = useState(1);
  // 필터를 바꾸거나 항목을 지우면 결과 수가 달라져 현재 페이지가 범위를 벗어날 수 있다.
  // 그대로 두면 빈 표가 보이므로 매 렌더마다 유효 범위로 당긴다.
  const currentPage = clampPage(page, filteredDepartments.length, PAGE_SIZE);
  const pagedDepartments = useMemo(
    () => pageSlice(filteredDepartments, currentPage, PAGE_SIZE),
    [filteredDepartments, currentPage],
  );

  function handleFieldChange(field) {
    return (event) => {
      const { value } = event.target;
      setForm((prev) => ({ ...prev, [field]: value }));
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function handleEditFieldChange(field) {
    return (event) => {
      const { value } = event.target;
      setEditForm((prev) => ({ ...prev, [field]: value }));
      setEditFormErrors((prev) => ({ ...prev, [field]: undefined }));
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

  function openEdit(department) {
    setEditingDepartment(department);
    setEditForm({ name: department.name });
    setEditFormErrors({});
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editingDepartment) return;
    const errors = validateDepartmentEditForm(editForm);
    setEditFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSaving(true);
    try {
      // 코드는 수정할 수 없고, 상태는 목록의 비활성화/활성화 버튼이 담당하므로
      // 현재 상태를 그대로 돌려보낸다.
      await updateDepartment(editingDepartment.id, {
        name: editForm.name.trim(),
        status: editingDepartment.status,
      });
      toast.success("부서 정보가 저장되었습니다.");
      setEditingDepartment(null);
      await refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "부서 수정에 실패했습니다."));
    } finally {
      setSaving(false);
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

      <ListStateSurface
        loading={loading}
        loadingMessage="부서 목록을 불러오는 중입니다..."
        error={loadError}
        onRetry={refresh}
        isEmpty={filteredDepartments.length === 0}
        emptyTitle={departments.length === 0 ? "등록된 부서가 없습니다." : "조건에 맞는 부서가 없습니다."}
        emptyDescription={
          departments.length === 0 ? "위 양식으로 첫 부서를 생성하세요." : "검색어 또는 상태 필터를 확인해 주세요."
        }
      >
        <DataTable
          ariaLabel="부서 목록"
          columns={[
            { key: "name", label: "부서명" },
            { key: "code", label: "코드" },
            { key: "status", label: "상태" },
            { key: "actions", label: "관리" },
          ]}
        >
          {pagedDepartments.map((department) => (
            <TableRow key={department.id}>
              <TableCell className="font-medium text-ink-strong">{department.name}</TableCell>
              <TableCell>{department.code}</TableCell>
              <TableCell>
                <StatusBadge status={department.status} />
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(department)}>
                    수정
                  </Button>
                  <Button
                    type="button"
                    variant={department.status === "ACTIVE" ? "destructive" : "secondary"}
                    size="sm"
                    onClick={() => setPendingToggle(department)}
                  >
                    {department.status === "ACTIVE" ? "비활성화" : "활성화"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </ListStateSurface>

      <Pagination page={currentPage} totalCount={filteredDepartments.length} onChange={setPage} />

      <Modal
        open={Boolean(editingDepartment)}
        title="부서 수정"
        onClose={() => setEditingDepartment(null)}
        dismissible={!saving}
      >
        {editingDepartment && (
          <form onSubmit={handleEditSubmit} className="space-y-4" noValidate>
            {/* 코드는 계정 엑셀 업로드의 부서 식별자라 변경할 수 없다(PUT payload에도 없다).
                수정 대상이 어느 부서인지는 코드로 밝혀 준다. */}
            <p className="text-body-small text-ink-muted">
              <span className="font-semibold text-ink-strong">{editingDepartment.code}</span> 부서의 이름을 변경합니다.
              부서 코드는 변경할 수 없습니다.
            </p>
            <Input
              id="edit-department-name"
              label="부서명"
              required
              value={editForm.name}
              onChange={handleEditFieldChange("name")}
              error={editFormErrors.name}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditingDepartment(null)}>
                취소
              </Button>
              <Button type="submit" loading={saving}>
                저장
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmToggleModal
        open={Boolean(pendingToggle)}
        pendingId={pendingToggle?.id}
        togglingId={togglingId}
        title={pendingToggle?.status === "ACTIVE" ? "부서 비활성화" : "부서 활성화"}
        message={
          pendingToggle && (
            <>
              <span className="font-semibold text-ink-strong">{pendingToggle.name}</span>
              {pendingToggle.status === "ACTIVE"
                ? " 부서를 비활성화합니다. 이 부서는 비활성 상태로 전환되며, 필요하면 다시 활성화할 수 있습니다."
                : " 부서를 다시 활성화합니다."}
            </>
          )
        }
        confirmLabel={pendingToggle?.status === "ACTIVE" ? "비활성화 확정" : "활성화 확정"}
        confirmVariant={pendingToggle?.status === "ACTIVE" ? "destructive" : "primary"}
        onCancel={() => setPendingToggle(null)}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
