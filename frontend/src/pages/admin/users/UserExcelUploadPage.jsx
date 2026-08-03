import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Upload } from "@phosphor-icons/react";
import { uploadUsersExcel } from "@/api/users.js";
import { resolveErrorMessage } from "@/api/client.js";
import { parseExcelErrorDetail } from "@/utils/excelUploadResult.js";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import DataTable, { TableRow, TableCell } from "@/components/ui/DataTable.jsx";

const TEMPLATE_COLUMNS = ["사번", "이름", "회사이메일", "부서코드", "역할"];
const TEMPLATE_EXAMPLE_ROW = ["E1001", "홍길동", "hong@company.com", "DEV", "EMPLOYEE"];

export default function UserExcelUploadPage() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleUpload() {
    if (!file) {
      toast.error("업로드할 엑셀 파일을 선택하세요.");
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const uploadResult = await uploadUsersExcel(file);
      setResult(uploadResult);
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
        <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">계정 일괄 등록</h1>
        <p className="mt-1 text-body-small text-ink-muted">엑셀 파일로 여러 계정을 한 번에 등록합니다.</p>
      </div>

      {/* 8.9: 템플릿 컬럼 안내를 작은 설명 텍스트와 예시 행으로 제공한다. */}
      <Surface className="p-5">
        <h2 className="text-section-title font-bold text-ink-strong">템플릿 안내</h2>
        <p className="mt-1 text-body-small text-ink-muted">
          엑셀 1행은 헤더이며, 2행부터 아래 순서의 컬럼으로 계정 정보를 입력합니다. 역할은 SUPER_ADMIN, DEPT_ADMIN,
          EMPLOYEE 중 하나입니다.
        </p>
        <div className="mt-4">
          <DataTable
            ariaLabel="엑셀 템플릿 컬럼 예시"
            columns={TEMPLATE_COLUMNS.map((label) => ({ key: label, label }))}
          >
            <TableRow>
              {TEMPLATE_EXAMPLE_ROW.map((value, index) => (
                <TableCell key={TEMPLATE_COLUMNS[index]}>{value}</TableCell>
              ))}
            </TableRow>
          </DataTable>
        </div>
      </Surface>

      {/* 8.9: 점선 Dropzone이 아니라 일반 Surface + 파일 선택 버튼으로 시작한다. */}
      <Surface className="p-5">
        <h2 className="text-section-title font-bold text-ink-strong">파일 업로드</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            id="user-excel-file"
            type="file"
            accept=".xlsx"
            aria-label="계정 엑셀 파일 선택"
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
                <p className="text-body font-semibold text-ink-strong">
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
