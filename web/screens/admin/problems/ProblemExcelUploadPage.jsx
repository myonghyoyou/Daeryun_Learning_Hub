import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Upload } from "@phosphor-icons/react";
import { uploadProblemsExcel } from "@/apiClient/problems.js";
import { listDepartments } from "@/apiClient/departments.js";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { buildUploadDepartmentField } from "@/utils/uploadDepartmentField.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { parseExcelErrorDetail } from "@/utils/excelUploadResult.js";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import Select from "@/components/ui/Select.jsx";
import DataTable, { TableRow, TableCell } from "@/components/ui/DataTable.jsx";

const TEMPLATE_COLUMNS = [
  "문제유형",
  "문제내용",
  "이미지",
  "참조지문",
  "보기1",
  "보기2",
  "보기3",
  "보기4",
  "보기5",
  "정답",
  "해설",
  "태그",
  // 13번째 컬럼. 서버의 COL_SOURCE_NUMBER(=12, 0부터) 와 같은 자리여야 한다.
  "문항번호",
];
const TEMPLATE_EXAMPLE_ROW = [
  "MCQ_SINGLE",
  "대한민국의 수도는?",
  "",
  "",
  "서울",
  "부산",
  "인천",
  "",
  "",
  "1",
  "대한민국의 수도는 서울이다.",
  "지리,상식",
  "1",
];

export default function ProblemExcelUploadPage() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const { session } = useSessionStatus();
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  // 직군은 엑셀 열이 아니라 여기서 고른다 — 한 파일은 어차피 한 직군이다.
  const [track, setTrack] = useState("ADMIN");

  // 부서 목록 API 는 총괄 관리자 전용이다. 부서 관리자가 호출하면 403 이 콘솔에 찍히므로
  // 역할을 보고 호출 자체를 하지 않는다.
  useEffect(() => {
    if (session?.role !== "SUPER_ADMIN") {
      return;
    }
    listDepartments()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, [session?.role]);

  const departmentField = useMemo(
    () => buildUploadDepartmentField({ session, departments }),
    [session, departments],
  );

  // 부서 관리자는 값이 세션에서 고정된다. 총괄 관리자는 빈 값에서 시작해 직접 고른다.
  useEffect(() => {
    if (departmentField.disabled) {
      setDepartmentId(departmentField.value);
    }
  }, [departmentField.disabled, departmentField.value]);

  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event) {
    setFile(event.target.files?.[0] ?? null);
    // 새 파일을 고르면 이전 업로드의 요약/오류 목록이 아직 업로드하지 않은 새 파일 옆에
    // 남아 있지 않도록 지운다(UserExcelUploadPage와 동일한 규칙).
    setResult(null);
  }

  async function handleUpload() {
    if (!file) {
      toast.error("업로드할 엑셀 파일을 선택하세요.");
      return;
    }
    if (!departmentId) {
      toast.error("업로드할 문제가 귀속될 부서를 선택하세요.");
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const uploadResult = await uploadProblemsExcel(file, departmentId, track);
      // 어디로 들어갔는지는 결과에 안 나온다. 잘못 고른 업로드는 되돌리기 어려우므로
      // 방금 고른 부서·직군을 결과와 함께 붙여 둔다(아래 결과 영역에서 보여 준다).
      setResult({
        ...uploadResult,
        departmentName: departments.find((d) => String(d.id) === String(departmentId))?.name ?? "",
        track,
      });
      toast.success(`업로드 완료: 성공 ${uploadResult.successRows}건 / 실패 ${uploadResult.failRows}건`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "업로드에 실패했습니다."));
    } finally {
      setUploading(false);
    }
  }

  const rowErrors = result ? parseExcelErrorDetail(result.errorDetail) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">문제 엑셀 일괄 등록</h1>
        <p className="mt-1 text-body-small text-ink-muted">엑셀 파일로 여러 문제를 한 번에 등록합니다.</p>
      </div>

      {/* 8.9: 템플릿 컬럼 안내를 작은 설명 텍스트와 예시 행으로 제공한다. 다운로드 가능한 템플릿
          파일/버튼은 두지 않는다 — Plan 3에서 "실제 템플릿 확정 후 별도 범위로 결정"하기로 닫힌
          이슈다. */}
      <Surface className="p-5">
        <h2 className="text-section-title font-bold text-ink-strong">템플릿 안내</h2>
        <p className="mt-1 text-body-small text-ink-muted">
          엑셀 1행은 헤더이며, 2행부터 아래 순서의 컬럼으로 문제를 입력합니다. 참조지문·해설·태그는
          비워둘 수 있습니다. 보기는 필요한 만큼만 채우되(최소 2개, 최대 5개) 중간 칸을 비운 채 뒤 칸을 채울 수는
          없습니다. 태그는 콤마로 구분합니다.
        </p>
        <p className="mt-1 text-body-small text-ink-muted">
          정답: 객관식(MCQ_SINGLE·MCQ_MULTI)과 OX는 보기 번호를 1부터 입력하며, 복수 정답은 콤마로 구분합니다.
          주관식(SHORT_ANSWER)은 콤마로 구분한 허용 정답 목록입니다.
        </p>
        <p className="mt-2 text-body-small font-semibold text-ink-strong">
          문항번호(마지막 13번째 컬럼)는 필수입니다. 종이 문제은행에 적힌 번호를 그대로 입력하며, 같은 부서
          안에서 번호가 겹치면 그 행은 저장되지 않습니다. 비워 두면 해당 행은 모두 실패합니다.
        </p>
        <p className="mt-2 text-body-small font-semibold text-danger-text">
          빈칸 채우기(FILL_BLANK)는 엑셀 업로드를 지원하지 않습니다. 개별 등록/수정 화면을 이용하세요.
        </p>
        <p className="mt-2 text-body-small font-semibold text-danger-text">
          이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를
          첨부하세요.
        </p>
        <div className="mt-4">
          <DataTable
            ariaLabel="엑셀 템플릿 컬럼 예시"
            columns={TEMPLATE_COLUMNS.map((label) => ({ key: label, label }))}
          >
            <TableRow>
              {TEMPLATE_EXAMPLE_ROW.map((value, index) => (
                <TableCell key={TEMPLATE_COLUMNS[index]}>{value || "—"}</TableCell>
              ))}
            </TableRow>
          </DataTable>
        </div>
      </Surface>

      {/* 8.9: 점선 Dropzone이 아니라 일반 Surface + 파일 선택 버튼으로 시작한다. */}
      <Surface className="p-5">
        <h2 className="text-section-title font-bold text-ink-strong">파일 업로드</h2>
        <p className="mt-1 text-body-small text-ink-muted">
          xlsx 또는 xls 파일만 업로드할 수 있으며, 한 번에 최대 500행까지 처리됩니다.
        </p>

        {/* 귀속 부서. 총괄 관리자만 고를 수 있고 부서 관리자는 자기 부서로 고정된다 — 다만
            이 disabled 는 실수 방지용이고 권한 판정은 서버가 한다. */}
        <div className="mt-4">
          <Select
            id="problem-excel-department"
            label="귀속 부서"
            required
            value={departmentId}
            disabled={departmentField.disabled || uploading}
            options={departmentField.options}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="w-72"
          />
          <p className="mt-1 text-body-small text-ink-muted">{departmentField.helpText}</p>
        </div>

        {/* 직군. 엑셀 파일에는 직군 열이 없다 — 한 파일은 한 직군이므로 여기서 고른다. */}
        <div className="mt-4">
          <Select
            id="problem-excel-track"
            label="직군"
            required
            value={track}
            disabled={uploading}
            options={[
              { value: "ADMIN", label: "행정직" },
              { value: "TECH", label: "기술직" },
            ]}
            onChange={(event) => setTrack(event.target.value)}
            className="w-72"
          />
          <p className="mt-1 text-body-small text-ink-muted">
            고른 직군의 직원에게만 보입니다. 파일 하나는 한 직군입니다.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            id="problem-excel-file"
            type="file"
            accept=".xlsx,.xls"
            aria-label="문제 엑셀 파일 선택"
            className="hidden"
            disabled={uploading}
            onChange={handleFileChange}
          />
          <Button type="button" variant="secondary" disabled={uploading} onClick={handleChooseFile}>
            파일 선택
          </Button>
          <span className="text-body-small text-ink-muted">{file ? file.name : "선택된 파일이 없습니다."}</span>
          <Button type="button" loading={uploading} onClick={handleUpload}>
            <Upload size={16} aria-hidden="true" />
            업로드
          </Button>
        </div>

        <div aria-live="polite">
          {uploading && <p className="mt-4 text-body-small text-ink-muted">업로드 중입니다. 잠시만 기다려 주세요...</p>}

          {result && (
            <div className="mt-4 space-y-4">
              {/* 8.6.3 부분 성공: 결과 요약과 오류 목록을 각각 제공한다. */}
              <div className="rounded-sm border border-line-default bg-surface-subtle p-4">
                {/* 어디로 들어갔는지 안 보이면 잘못 고른 업로드를 알아챌 방법이 없다.
                    부서 오선택은 사실상 되돌릴 수 없으므로 이 표시가 유일한 사후 확인이다. */}
                <p className="text-body-small text-ink-muted">
                  {result.departmentName} · {result.track === "TECH" ? "기술직" : "행정직"} 으로 등록
                </p>
                <p className="mt-1 text-body font-semibold text-ink-strong">
                  전체 {result.totalRows}건 중 성공 {result.successRows}건 / 실패 {result.failRows}건
                </p>
              </div>

              {rowErrors.length > 0 && (
                <div className="rounded-sm border border-line-default p-4">
                  <p className="text-body-small font-semibold text-danger-text">행별 오류</p>
                  <ul className="mt-2 space-y-1">
                    {rowErrors.map((rowError, index) => (
                      <li key={index} className="text-body-small text-danger-text">
                        {rowError.row ? `행 ${rowError.row}: ${rowError.reason}` : rowError.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}
