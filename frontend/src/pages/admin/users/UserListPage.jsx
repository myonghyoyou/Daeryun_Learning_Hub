import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Plus } from "@phosphor-icons/react";
import { createUser, listUsers, updateUser } from "@/api/users.js";
import { listDepartments } from "@/api/departments.js";
import { resolveErrorMessage } from "@/api/client.js";
import { filterUsers } from "@/utils/userFilters.js";
import { validateUserCreateForm, validateUserEditForm } from "@/utils/userValidation.js";
import { ROLE_OPTIONS, roleLabel } from "@/utils/userRole.js";
import { formatLastLogin } from "@/utils/userFormat.js";
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

const EMPTY_CREATE_FORM = { employeeNo: "", name: "", email: "", departmentId: "", role: "EMPLOYEE" };
const EMPTY_EDIT_FORM = { name: "", email: "", departmentId: "", role: "EMPLOYEE" };

export default function UserListPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createFormErrors, setCreateFormErrors] = useState({});
  const [creating, setCreating] = useState(false);
  // 임시 비밀번호 메일 발송 결과를 Toast 외에 화면에도 남겨 둔다(8.10, 8.6.3).
  const [createNotice, setCreateNotice] = useState(null);

  // 수정 대상. null이면 Modal이 닫힌 상태다.
  const [editingUser, setEditingUser] = useState(null);
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
      const [userList, departmentList] = await Promise.all([listUsers(), listDepartments()]);
      setUsers(userList);
      setDepartments(departmentList);
    } catch (error) {
      const message = resolveErrorMessage(error, "계정 목록을 불러오지 못했습니다.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filteredUsers = useMemo(() => filterUsers(users, { keyword, status: statusFilter }), [users, keyword, statusFilter]);

  const departmentOptions = useMemo(
    () => [{ value: "", label: "부서 선택" }, ...departments.map((department) => ({ value: String(department.id), label: department.name }))],
    [departments],
  );

  function handleCreateFieldChange(field) {
    return (event) => {
      const { value } = event.target;
      setCreateForm((prev) => ({ ...prev, [field]: value }));
      setCreateFormErrors((prev) => ({ ...prev, [field]: undefined }));
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
    const errors = validateUserCreateForm(createForm);
    setCreateFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setCreating(true);
    setCreateNotice(null);
    try {
      const response = await createUser({
        employeeNo: createForm.employeeNo.trim(),
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        departmentId: Number(createForm.departmentId),
        role: createForm.role,
      });
      toast.success(`${response.email}로 임시 비밀번호를 발송했습니다.`);
      setCreateNotice({ email: response.email });
      setCreateForm(EMPTY_CREATE_FORM);
      await refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "계정 생성에 실패했습니다."));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(user) {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      departmentId: String(user.departmentId),
      role: user.role,
    });
    setEditFormErrors({});
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editingUser) return;
    const errors = validateUserEditForm(editForm);
    setEditFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSaving(true);
    try {
      await updateUser(editingUser.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        departmentId: Number(editForm.departmentId),
        role: editForm.role,
        status: editingUser.status,
      });
      toast.success("계정 정보가 저장되었습니다.");
      setEditingUser(null);
      await refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "계정 수정에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    const nextStatus = pendingToggle.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setTogglingId(pendingToggle.id);
    try {
      await updateUser(pendingToggle.id, {
        name: pendingToggle.name,
        email: pendingToggle.email,
        departmentId: pendingToggle.departmentId,
        role: pendingToggle.role,
        status: nextStatus,
      });
      toast.success(nextStatus === "INACTIVE" ? "계정이 비활성화되었습니다." : "계정이 활성화되었습니다.");
      setPendingToggle(null);
      await refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "계정 상태 변경에 실패했습니다."));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">계정 관리</h1>
        <p className="mt-1 text-body-small text-ink-muted">계정을 생성하고 부서·역할·상태를 관리합니다.</p>
      </div>

      {/* 8.10: 상단에는 검색·상태 필터·생성 버튼만 둔다. */}
      <Surface className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            id="user-search"
            label="검색"
            placeholder="사번, 이름, 이메일 또는 부서로 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="w-full sm:w-72"
          />
          <Select
            id="user-status-filter"
            label="상태"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={STATUS_FILTER_OPTIONS}
            className="w-40"
          />
        </div>
      </Surface>

      <Surface className="p-5">
        <h2 className="text-section-title font-bold text-ink-strong">계정 생성</h2>
        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
          <Input
            id="user-employee-no"
            label="사번"
            required
            value={createForm.employeeNo}
            onChange={handleCreateFieldChange("employeeNo")}
            error={createFormErrors.employeeNo}
            className="w-full sm:w-32"
          />
          <Input
            id="user-name"
            label="이름"
            required
            value={createForm.name}
            onChange={handleCreateFieldChange("name")}
            error={createFormErrors.name}
            className="w-full sm:w-40"
          />
          <Input
            id="user-email"
            label="회사 이메일"
            type="email"
            required
            value={createForm.email}
            onChange={handleCreateFieldChange("email")}
            error={createFormErrors.email}
            className="w-full sm:w-64"
          />
          <Select
            id="user-department"
            label="부서"
            required
            value={createForm.departmentId}
            onChange={handleCreateFieldChange("departmentId")}
            options={departmentOptions}
            error={createFormErrors.departmentId}
            className="w-full sm:w-40"
          />
          <Select
            id="user-role"
            label="역할"
            required
            value={createForm.role}
            onChange={handleCreateFieldChange("role")}
            options={ROLE_OPTIONS}
            error={createFormErrors.role}
            className="w-full sm:w-40"
          />
          <Button type="submit" loading={creating}>
            <Plus size={16} aria-hidden="true" />
            계정 생성
          </Button>
        </form>
        {/* 임시 비밀번호 메일 발송 결과의 화면 내 확인 문구(Toast와 별개로 유지). */}
        <div aria-live="polite">
          {createNotice && (
            <p className="mt-3 text-body-small text-success-text">
              {createNotice.email}로 임시 비밀번호 메일을 발송했습니다. 화면·응답에는 비밀번호가 표시되지 않습니다.
            </p>
          )}
        </div>
      </Surface>

      <Surface>
        <div aria-live="polite">
          {loading ? (
            <p className="px-5 py-10 text-center text-body-small text-ink-muted">계정 목록을 불러오는 중입니다...</p>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="text-body-small text-danger-text">{loadError}</p>
              <Button variant="secondary" size="sm" onClick={refresh}>
                다시 시도
              </Button>
            </div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              title={users.length === 0 ? "등록된 계정이 없습니다." : "조건에 맞는 계정이 없습니다."}
              description={
                users.length === 0 ? "위 양식으로 첫 계정을 생성하세요." : "검색어 또는 상태 필터를 확인해 주세요."
              }
            />
          ) : (
            <DataTable
              ariaLabel="계정 목록"
              columns={[
                { key: "employeeNo", label: "사번" },
                { key: "name", label: "이름" },
                { key: "email", label: "회사 이메일" },
                { key: "department", label: "부서" },
                { key: "role", label: "역할" },
                { key: "status", label: "상태" },
                { key: "lastLogin", label: "최근 로그인" },
                { key: "actions", label: "관리" },
              ]}
            >
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium text-ink-strong">{user.employeeNo}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>
                    {/* 긴 회사 이메일은 ellipsis 처리하고, 전체 값은 수정 Modal에서 제공한다(8.10). */}
                    <span className="block max-w-[220px] truncate" title={user.email}>
                      {user.email}
                    </span>
                  </TableCell>
                  <TableCell>{user.departmentName}</TableCell>
                  <TableCell>{roleLabel(user.role)}</TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell>{formatLastLogin(user.lastLoginAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(user)}>
                        수정
                      </Button>
                      <Button
                        type="button"
                        variant={user.status === "ACTIVE" ? "destructive" : "secondary"}
                        size="sm"
                        onClick={() => setPendingToggle(user)}
                      >
                        {user.status === "ACTIVE" ? "비활성화" : "활성화"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
        </div>
      </Surface>

      <Modal
        open={Boolean(editingUser)}
        title="계정 수정"
        onClose={() => setEditingUser(null)}
        dismissible={!saving}
      >
        {editingUser && (
          <form onSubmit={handleEditSubmit} className="space-y-4" noValidate>
            <Input
              id="edit-user-name"
              label="이름"
              required
              value={editForm.name}
              onChange={handleEditFieldChange("name")}
              error={editFormErrors.name}
            />
            <Input
              id="edit-user-email"
              label="회사 이메일"
              type="email"
              required
              value={editForm.email}
              onChange={handleEditFieldChange("email")}
              error={editFormErrors.email}
            />
            <Select
              id="edit-user-department"
              label="부서"
              required
              value={editForm.departmentId}
              onChange={handleEditFieldChange("departmentId")}
              options={departmentOptions}
              error={editFormErrors.departmentId}
            />
            <Select
              id="edit-user-role"
              label="역할"
              required
              value={editForm.role}
              onChange={handleEditFieldChange("role")}
              options={ROLE_OPTIONS}
              error={editFormErrors.role}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditingUser(null)}>
                취소
              </Button>
              <Button type="submit" loading={saving}>
                저장
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(pendingToggle)}
        title={pendingToggle?.status === "ACTIVE" ? "계정 비활성화" : "계정 활성화"}
        onClose={() => setPendingToggle(null)}
        dismissible={canDismissConfirmModal({ pendingId: pendingToggle?.id, togglingId })}
      >
        {pendingToggle && (
          <div className="space-y-4">
            <p className="text-body text-ink-default">
              <span className="font-semibold text-ink-strong">
                {pendingToggle.name}({pendingToggle.employeeNo})
              </span>
              {pendingToggle.status === "ACTIVE"
                ? " 계정을 비활성화합니다. 비활성화된 계정은 로그인할 수 없으며, 필요하면 다시 활성화할 수 있습니다."
                : " 계정을 다시 활성화합니다. 활성화하면 다시 로그인할 수 있습니다."}
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
