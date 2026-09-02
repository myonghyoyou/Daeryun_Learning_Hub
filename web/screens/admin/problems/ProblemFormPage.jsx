import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { Plus, Trash } from "@phosphor-icons/react";
import {
  changeProblemDepartment,
  createProblem,
  fetchNextSourceNumber,
  getProblem,
  updateProblem,
  uploadProblemImage,
} from "@/apiClient/problems.js";
import { listDepartments } from "@/apiClient/departments.js";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { buildUploadDepartmentField } from "@/utils/uploadDepartmentField.js";
import { ApiError, resolveErrorMessage } from "@/apiClient/client.js";
import { problemTypeLabel } from "@/utils/problemLabels.js";
import { MAX_CHOICES, MIN_CHOICES, createChoice, setChoiceCorrect } from "@/utils/problemChoices.js";
import { createBlank } from "@/utils/problemBlanks.js";
import { designateBlank, releaseBlank, adjustBlankBoundary } from "@/utils/blankTokens.js";
import { parseTagsInput, normalizeTags } from "@/utils/problemTags.js";
import { validateImageFile } from "@/utils/problemImageValidation.js";
import { validateProblemForm } from "@/utils/problemFormValidation.js";
import { buildProblemPayload } from "@/utils/problemFormPayload.js";
import { formatFileSize } from "@/utils/formatFileSize.js";
import { buttonClass } from "@/utils/buttonClass.js";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Select from "@/components/ui/Select.jsx";
import TagChip from "@/components/ui/TagChip.jsx";
import BlankDesignator from "@/components/admin/BlankDesignator.jsx";
import { blankHostField } from "@/lib/problem/blankHost";

// 5개 유형 전체 — 서술형은 없다(태스크 8 서버 사이드 규칙).
const TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "OX", "SHORT_ANSWER", "FILL_BLANK"];
const TYPE_OPTIONS = TYPES.map((type) => ({ value: type, label: problemTypeLabel(type) }));

function defaultChoicesFor(type) {
  if (type === "OX") {
    return [
      { text: "O", correct: false },
      { text: "X", correct: false },
    ];
  }
  return [createChoice(), createChoice()];
}

// Input/Select와 동일한 label·필수 표기·오류 텍스트 규칙(디자인 시스템 7.5)을 쓰지만
// 여러 줄 입력이 필요한 필드용. 이 화면에만 필요해서 별도 공유 컴포넌트로 뽑지 않고
// Input.jsx의 마크업을 그대로 따른다.
function Textarea({ id, label, required, error, className = "", ...props }) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-label font-bold text-ink-default">
          {label}
          {required && <span className="ml-1 font-bold text-danger-text">필수</span>}
        </label>
      )}
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`w-full rounded-sm border bg-surface-default px-3 py-2 text-body text-ink-strong placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua ${
          error ? "border-danger-text" : "border-line-default"
        }`}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-body-small text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

export default function ProblemFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const router = useRouter();
  const fileInputRef = useRef(null);

  const { session } = useSessionStatus();
  const [departments, setDepartments] = useState([]);
  const [moveDepartmentId, setMoveDepartmentId] = useState("");
  const [moving, setMoving] = useState(false);
  const canMoveDepartment = Boolean(id) && session?.role === "SUPER_ADMIN";
  // 등록 모드에서는 귀속 부서를 고른다. 부서 관리자는 자기 부서로 고정된다.
  const [createDepartmentId, setCreateDepartmentId] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [type, setType] = useState("MCQ_SINGLE");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageMeta, setImageMeta] = useState(null); // { name, size } — 이번 세션에 새로 고른 파일만 안다.
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [referenceText, setReferenceText] = useState("");
  const [explanation, setExplanation] = useState("");
  const [choices, setChoices] = useState(defaultChoicesFor("MCQ_SINGLE"));
  const [answers, setAnswers] = useState([""]);
  const [blanks, setBlanks] = useState([createBlank()]);
  // 쓰기 모드(textarea 자유 입력) ↔ 지정 모드(어절 클릭). 기본은 쓰기.
  const [blankMode, setBlankMode] = useState("write");
  const [blankRevealCount, setBlankRevealCount] = useState(1);
  const [tagsInput, setTagsInput] = useState("");
  const [sourceNumber, setSourceNumber] = useState("");

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const previewTags = useMemo(() => normalizeTags(parseTagsInput(tagsInput)), [tagsInput]);

  async function fetchProblem() {
    setLoading(true);
    setLoadError(null);
    setPermissionDenied(false);
    try {
      const problem = await getProblem(id);
      setType(problem.type);
      setContent(problem.content ?? "");
      setImageUrl(problem.imageUrl ?? "");
      setImageMeta(null);
      setReferenceText(problem.referenceText ?? "");
      setExplanation(problem.explanation ?? "");
      setTagsInput((problem.tags ?? []).join(", "));
      setSourceNumber(problem.sourceNumber == null ? "" : String(problem.sourceNumber));
      if (problem.type === "SHORT_ANSWER") {
        setAnswers(problem.answers?.length ? problem.answers : [""]);
      } else if (problem.type === "FILL_BLANK") {
        setBlanks(
          problem.blanks?.length
            ? problem.blanks.map((blank) => ({ blankKey: blank.blankKey, answerText: blank.answerText }))
            : [createBlank()],
        );
        setBlankRevealCount(problem.blankRevealCount ?? 1);
      } else {
        setChoices(
          problem.choices?.length
            ? problem.choices.map((choice) => ({ text: choice.choiceText, correct: choice.correct }))
            : defaultChoicesFor(problem.type),
        );
      }
    } catch (error) {
      // 990 = ACCESS_AUTH_DENIED: 다른 부서 문제를 부서관리자가 열었을 때. 재시도로는 해소되지
      // 않으므로 "다시 시도"가 아니라 권한 없음 안내로 갈라 보여준다.
      if (error instanceof ApiError && error.resultCode === 990) {
        setPermissionDenied(true);
      } else {
        setLoadError(resolveErrorMessage(error, "문제 정보를 불러오지 못했습니다."));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isEdit) fetchProblem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function clearError(field) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function handleTypeChange(event) {
    // 수정 화면에서는 Select 자체가 disabled라 이 핸들러가 호출될 일이 없다(유형은
    // 서버가 수정 요청 자체를 거부한다 — ProblemServiceImpl.update).
    const nextType = event.target.value;
    setType(nextType);
    setChoices(defaultChoicesFor(nextType));
    setAnswers([""]);
    setBlanks([createBlank()]);
    setBlankRevealCount(1);
    setErrors((prev) => ({ ...prev, choices: undefined, answers: undefined, blanks: undefined }));
  }

  // ----- 보기 (MCQ_SINGLE / MCQ_MULTI / OX) -----
  function handleChoiceTextChange(index, value) {
    setChoices((prev) => prev.map((choice, i) => (i === index ? { ...choice, text: value } : choice)));
    clearError("choices");
  }

  function handleChoiceCorrectChange(index) {
    setChoices((prev) => setChoiceCorrect(prev, index, type));
    clearError("choices");
  }

  function addChoice() {
    setChoices((prev) => [...prev, createChoice()]);
    clearError("choices");
  }

  function removeChoice(index) {
    setChoices((prev) => prev.filter((_, i) => i !== index));
    clearError("choices");
  }

  // ----- 정답 (SHORT_ANSWER) -----
  function handleAnswerChange(index, value) {
    setAnswers((prev) => prev.map((answer, i) => (i === index ? value : answer)));
    clearError("answers");
  }

  function addAnswer() {
    setAnswers((prev) => [...prev, ""]);
    clearError("answers");
  }

  function removeAnswer(index) {
    setAnswers((prev) => prev.filter((_, i) => i !== index));
    clearError("answers");
  }

  // ----- 빈칸 (FILL_BLANK) -----
  function handleBlankKeyChange(index, value) {
    setBlanks((prev) => prev.map((blank, i) => (i === index ? { ...blank, blankKey: value } : blank)));
    clearError("blanks");
  }

  function handleBlankAnswerChange(index, value) {
    setBlanks((prev) => prev.map((blank, i) => (i === index ? { ...blank, answerText: value } : blank)));
    clearError("blanks");
  }

  // 2026-09-02: 질문/지문을 나누면서 마커가 참조지문으로 옮겨 갔다. 마커가 든 쪽을 여기서
  // 한 번 정하고 지정·해제·경계조정 세 콜백이 같은 필드를 읽고 쓴다 — 각자 정하면 한쪽만
  // 바뀌어 마커와 글이 어긋난다(lib/problem/blankHost.ts 가 같은 판단을 한다).
  const blankField = blankHostField(referenceText);
  const blankSourceText = blankField === "referenceText" ? referenceText : content;
  const setBlankSourceText = blankField === "referenceText" ? setReferenceText : setContent;

  // 지정 모드(BlankDesignator) 콜백. 셋 다 순수 함수(blankTokens.js) 결과를 그 필드·blanks에
  // 그대로 흘린다 — 마커가 든 문자열({{bN}} 포함)이 단일 진실이라 쓰기 모드 textarea와
  // 여기서 만든 결과가 항상 같은 값을 공유한다.
  function handleDesignate(wordSeg) {
    // 새 등록 폼과 handleTypeChange는 blanks를 [createBlank()](키·정답 모두 빈 자리표시자
    // 한 행)로 seed한다. designateBlank는 항상 append만 하므로, 이 빈 자리표시자를 그대로
    // 두면 사용자가 지정 모드에서 만든 첫 빈칸 뒤에 손대지 않은 빈 행이 남아
    // validateBlanks("빈칸 키와 정답을 모두 입력하세요.")에 걸린다 — 사용자는 아무 잘못도
    // 안 했는데 저장이 막힌다. 키·정답이 "둘 다" 빈 행만 지운다(OR): 키만 먼저 채워 넣은
    // 행은 사용자 입력이 있으므로 살려야 한다.
    const seeded = blanks.filter((b) => b.blankKey.trim() || b.answerText.trim());
    const next = designateBlank(blankSourceText, seeded, wordSeg);
    setBlankSourceText(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }

  function handleRelease(key) {
    const next = releaseBlank(blankSourceText, blanks, key);
    setBlankSourceText(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }

  function handleAdjust(key, delta) {
    const next = adjustBlankBoundary(blankSourceText, blanks, key, delta);
    setBlankSourceText(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }

  function addBlank() {
    setBlanks((prev) => [...prev, createBlank()]);
    clearError("blanks");
  }

  function removeBlank(index) {
    setBlanks((prev) => prev.filter((_, i) => i !== index));
    clearError("blanks");
  }

  // ----- 태그 -----
  function handleTagsInputChange(event) {
    setTagsInput(event.target.value);
    clearError("tags");
  }

  function handleRemoveTag(tag) {
    const next = parseTagsInput(tagsInput).filter((t) => t.toLowerCase() !== tag.toLowerCase());
    setTagsInput(next.join(", "));
    clearError("tags");
  }

  // ----- 이미지 -----
  function handleChooseImage() {
    fileInputRef.current?.click();
  }

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 선택해도 onChange가 발생하도록 즉시 비운다.
    event.target.value = "";
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setImageError(validationError);
      toast.error(validationError);
      return;
    }

    setImageError(null);
    setUploading(true);
    try {
      const response = await uploadProblemImage(file);
      setImageUrl(response.imageUrl);
      setImageMeta({ name: file.name, size: file.size });
      toast.success("이미지가 업로드되었습니다.");
    } catch (error) {
      const message = resolveErrorMessage(error, "이미지 업로드에 실패했습니다.");
      setImageError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveImage() {
    setImageUrl("");
    setImageMeta(null);
    setImageError(null);
  }

  // 이 useEffect 는 반드시 아래의 조기 return(loading/permissionDenied/loadError) 보다 위에
  // 있어야 한다. 아래에 두면 첫 렌더에서 실행되지 않아 "Rendered more hooks than during the
  // previous render" 로 화면이 통째로 깨진다.
  // 부서 목록 API 는 총괄 관리자 전용이다. 부서 관리자가 호출하면 403 이 콘솔에 찍히므로
  // 역할을 보고 호출 자체를 하지 않는다.
  const needsDepartmentList = session?.role === "SUPER_ADMIN";
  useEffect(() => {
    if (!needsDepartmentList) {
      return;
    }
    listDepartments()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, [needsDepartmentList]);

  const createDepartmentField = useMemo(
    () => buildUploadDepartmentField({ session, departments }),
    [session, departments],
  );

  // 부서 관리자는 값이 세션에서 고정된다. 총괄 관리자는 빈 값에서 시작해 직접 고른다 —
  // 자동 선택하면 고르는 것을 잊었을 때 조용히 본인 부서로 들어간다.
  useEffect(() => {
    if (createDepartmentField.disabled) {
      setCreateDepartmentId(createDepartmentField.value);
    }
  }, [createDepartmentField.disabled, createDepartmentField.value]);

  useEffect(() => {
    // 수정 모드에서는 기존 번호를 덮어쓰면 안 된다.
    if (isEdit) return;
    // 부서를 바꿀 때마다 먼저 비운다 — 이전 부서에서 받은 번호가 남아 있으면 안 되고,
    // 부서 선택을 취소했을 때도 번호가 남으면 안 된다.
    setSourceNumber("");
    if (!createDepartmentId) return;
    let cancelled = false;
    fetchNextSourceNumber(createDepartmentId)
      .then((next) => {
        // 관리자가 응답이 오기 전에 이미 번호를 입력했다면 덮어쓰지 않는다.
        if (!cancelled) setSourceNumber((current) => (current === "" ? String(next) : current));
      })
      .catch(() => {
        // 실패해도 등록을 막지 않는다 — 관리자가 직접 넣으면 된다. 위에서 이미 비워뒀고
        // 그 사이 입력한 값이 있을 수 있으니 여기서는 아무것도 하지 않는다(덮어쓰지 않는다).
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, createDepartmentId]);

  async function handleSubmit(event) {
    event.preventDefault();
    const formState = { type, content, referenceText, choices, answers, blanks, blankRevealCount, tagsInput };
    const validationErrors = validateProblemForm(formState);
    setErrors(validationErrors);
    if (!isEdit && !createDepartmentId) {
      toast.error("문제가 귀속될 부서를 선택하세요.");
      return;
    }
    if (Object.keys(validationErrors).length > 0) {
      toast.error("입력값을 확인해 주세요.");
      return;
    }

    const payload = buildProblemPayload({ ...formState, imageUrl, referenceText, explanation, sourceNumber });
    setSaving(true);
    try {
      if (isEdit) {
        await updateProblem(id, payload);
        toast.success("문제가 수정되었습니다.");
      } else {
        await createProblem(payload, createDepartmentId);
        toast.success("문제가 등록되었습니다.");
      }
      router.push("/admin/problems");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && loading) {
    return (
      <Surface className="p-10 text-center text-body-small text-ink-muted" aria-live="polite">
        문제 정보를 불러오는 중입니다...
      </Surface>
    );
  }

  if (isEdit && permissionDenied) {
    return (
      <Surface className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-body font-semibold text-ink-strong">이 문제에 접근할 권한이 없습니다.</p>
        <p className="text-body-small text-ink-muted">
          다른 부서가 등록한 문제는 총괄 관리자만 열람·수정할 수 있습니다.
        </p>
        <Link href="/admin/problems" className={buttonClass({ variant: "secondary", size: "md" })}>
          목록으로
        </Link>
      </Surface>
    );
  }

  if (isEdit && loadError) {
    return (
      <Surface className="flex flex-col items-center gap-3 p-10 text-center" aria-live="polite">
        <p className="text-body-small text-danger-text">{loadError}</p>
        <Button variant="secondary" size="sm" onClick={fetchProblem}>
          다시 시도
        </Button>
      </Surface>
    );
  }

  const isMcqOrOx = type === "MCQ_SINGLE" || type === "MCQ_MULTI" || type === "OX";

  async function handleMoveDepartment() {
    if (!moveDepartmentId) {
      toast.error("옮길 부서를 선택하세요.");
      return;
    }
    setMoving(true);
    try {
      const moved = await changeProblemDepartment(id, moveDepartmentId);
      toast.success(`부서를 옮겼습니다. 문항 번호가 ${moved.sourceNumber}번으로 바뀌었습니다.`);
      setSourceNumber(String(moved.sourceNumber));
    } catch (error) {
      toast.error(resolveErrorMessage(error, "부서를 변경하지 못했습니다."));
    } finally {
      setMoving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">
            {isEdit ? "문제 수정" : "문제 등록"}
          </h1>
          <p className="mt-1 text-body-small text-ink-muted">
            유형에 맞는 보기·정답·빈칸을 입력하고 저장하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={() => router.push("/admin/problems")}>
            취소
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? "수정 저장" : "등록"}
          </Button>
        </div>
      </div>

      {/* 8.8: 문제 유형 선택은 폼 상단. 수정 화면에서는 서버가 유형 변경을 거부하므로
          (ProblemServiceImpl.update) disabled 처리하고 이유를 함께 안내한다. */}
      <Surface className="p-5">
        <Select
          id="problem-type"
          label="문제 유형"
          required
          value={type}
          onChange={handleTypeChange}
          options={TYPE_OPTIONS}
          disabled={isEdit}
          className="w-full sm:w-64"
        />
        {isEdit && (
          <p className="mt-1 text-body-small text-ink-muted">
            문제 유형은 등록 후 변경할 수 없습니다. 다른 유형이 필요하면 새 문제로 등록하세요.
          </p>
        )}

        {/* 귀속 부서는 등록할 때만 고른다. 수정 화면에서는 아래 "귀속 부서 이동" 카드가
            같은 일을 하되 별도 API 로 즉시 적용한다. */}
        {!isEdit && (
          <div className="mt-4">
            <Select
              id="problem-create-department"
              label="귀속 부서"
              required
              value={createDepartmentId}
              disabled={createDepartmentField.disabled || saving}
              options={createDepartmentField.options}
              onChange={(event) => setCreateDepartmentId(event.target.value)}
              className="w-full sm:w-64"
            />
            <p className="mt-1 text-body-small text-ink-muted">{createDepartmentField.helpText}</p>
          </div>
        )}

        <Input
          id="problem-source-number"
          type="number"
          min="1"
          label="문항 번호"
          required
          value={sourceNumber}
          onChange={(event) => setSourceNumber(event.target.value)}
          className="mt-4 w-40"
        />

        <Textarea
          id="problem-content"
          label="문제 내용"
          required
          className="mt-4"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            clearError("content");
            if (type === "FILL_BLANK") clearError("blanks");
          }}
          error={errors.content}
          rows={4}
          placeholder={
            type === "FILL_BLANK"
              ? "빈칸 위치에 {{blank_1}}처럼 이중 중괄호 마커를 넣으세요. 예: 대한민국의 수도는 {{blank_1}}이다."
              : "문제 내용을 입력하세요."
          }
        />
      </Surface>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 8.8: 왼쪽 8 — 유형별 동적 입력 영역 */}
        <div className="space-y-6 lg:col-span-8">
          {isMcqOrOx && (
            <Surface className="p-5">
              <p className="text-body font-semibold text-ink-strong">
                보기 (최대 {MAX_CHOICES}개)
                <span className="ml-1 font-bold text-danger-text">필수</span>
              </p>
              <p className="mt-1 text-body-small text-ink-muted">
                {type === "OX"
                  ? "OX 문제는 보기 2개가 고정이며, 정답 개수는 1개여야 합니다."
                  : type === "MCQ_MULTI"
                    ? "정답을 1개 이상 선택하세요."
                    : "정답을 1개만 선택하세요."}
              </p>
              <div className="mt-3 space-y-2">
                {choices.map((choice, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      id={`problem-choice-${index}`}
                      aria-label={`보기 ${index + 1}`}
                      value={choice.text}
                      onChange={(event) => handleChoiceTextChange(index, event.target.value)}
                      className="flex-1"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-body-small text-ink-default">
                      <input
                        type={type === "MCQ_MULTI" ? "checkbox" : "radio"}
                        name="problem-correct-choice"
                        checked={choice.correct}
                        onChange={() => handleChoiceCorrectChange(index)}
                        className="focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
                      />
                      정답
                    </label>
                    {type !== "OX" && choices.length > MIN_CHOICES && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => removeChoice(index)}
                        aria-label={`보기 ${index + 1} 삭제`}
                      >
                        <Trash size={14} aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {type !== "OX" && choices.length < MAX_CHOICES && (
                <Button type="button" variant="tertiary" size="sm" className="mt-2" onClick={addChoice}>
                  <Plus size={14} aria-hidden="true" />
                  보기 추가
                </Button>
              )}
              {errors.choices && <p className="mt-2 text-body-small text-danger-text">{errors.choices}</p>}
            </Surface>
          )}

          {type === "SHORT_ANSWER" && (
            <Surface className="p-5">
              <p className="text-body font-semibold text-ink-strong">
                정답 (복수 허용)
                <span className="ml-1 font-bold text-danger-text">필수</span>
              </p>
              <p className="mt-1 text-body-small text-ink-muted">
                여러 개를 입력하면 그중 하나만 맞아도 정답으로 처리됩니다.
              </p>
              <div className="mt-3 space-y-2">
                {answers.map((answer, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      id={`problem-answer-${index}`}
                      aria-label={`정답 ${index + 1}`}
                      value={answer}
                      onChange={(event) => handleAnswerChange(index, event.target.value)}
                      className="flex-1"
                    />
                    {answers.length > 1 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => removeAnswer(index)}
                        aria-label={`정답 ${index + 1} 삭제`}
                      >
                        <Trash size={14} aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="tertiary" size="sm" className="mt-2" onClick={addAnswer}>
                <Plus size={14} aria-hidden="true" />
                정답 추가
              </Button>
              {errors.answers && <p className="mt-2 text-body-small text-danger-text">{errors.answers}</p>}
            </Surface>
          )}

          {type === "FILL_BLANK" && (
            <Surface className="p-5">
              <p className="text-body font-semibold text-ink-strong">
                빈칸 후보
                <span className="ml-1 font-bold text-danger-text">필수</span>
              </p>
              <p className="mt-1 text-body-small text-ink-muted">
                각 키는 위 문제 내용에 <code className="rounded-xs bg-surface-subtle px-1">{"{{키}}"}</code>{" "}
                형태로 반드시 등장해야 합니다. 실제 출제 시에는 등록한 빈칸 후보 중 위에서 지정한 개수만큼
                무작위로 노출됩니다. 여기서는 후보와 노출 개수만 저장합니다.
              </p>

              {/* 쓰기/지정 모드 토글. 지정 모드는 위 문제 내용(content)을 어절로 렌더해 클릭으로
                  빈칸을 만든다. content 는 마커 문자열 하나가 단일 진실이라 두 모드가 같은 값을 공유한다. */}
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant={blankMode === "write" ? "primary" : "secondary"}
                  size="sm"
                  aria-pressed={blankMode === "write"}
                  onClick={() => setBlankMode("write")}
                >
                  쓰기 모드
                </Button>
                <Button
                  type="button"
                  variant={blankMode === "designate" ? "primary" : "secondary"}
                  size="sm"
                  aria-pressed={blankMode === "designate"}
                  onClick={() => setBlankMode("designate")}
                >
                  빈칸 지정 모드
                </Button>
              </div>

              {blankMode === "designate" ? (
                <div className="mt-3">
                  <p className="mb-2 text-body-small text-ink-muted">
                    {blankField === "referenceText" ? "참조지문에서 빈칸을 지정합니다. " : ""}
                    문장의 단어를 클릭하면 빈칸이 됩니다. 조사·쉼표는 자동으로 분리되며, 빈칸 칩의
                    화살표로 정답 범위를 한 글자씩 조정할 수 있습니다.
                  </p>
                  <BlankDesignator
                    content={blankSourceText}
                    blanks={blanks}
                    onDesignate={handleDesignate}
                    onRelease={handleRelease}
                    onAdjust={handleAdjust}
                  />
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {blanks.map((blank, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      id={`problem-blank-key-${index}`}
                      aria-label={`빈칸 ${index + 1} 키`}
                      placeholder="blank_1"
                      value={blank.blankKey}
                      onChange={(event) => handleBlankKeyChange(index, event.target.value)}
                      className="w-40"
                    />
                    <Input
                      id={`problem-blank-answer-${index}`}
                      aria-label={`빈칸 ${index + 1} 정답`}
                      placeholder="정답"
                      value={blank.answerText}
                      onChange={(event) => handleBlankAnswerChange(index, event.target.value)}
                      className="flex-1"
                    />
                    {blanks.length > 1 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => removeBlank(index)}
                        aria-label={`빈칸 ${index + 1} 삭제`}
                      >
                        <Trash size={14} aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="tertiary" size="sm" className="mt-2" onClick={addBlank}>
                <Plus size={14} aria-hidden="true" />
                빈칸 추가
              </Button>
              {errors.blanks && <p className="mt-2 text-body-small text-danger-text">{errors.blanks}</p>}

              <Input
                id="problem-blank-reveal-count"
                type="number"
                label="출제 시 노출할 빈칸 개수"
                required
                min={1}
                max={blanks.length}
                value={blankRevealCount}
                onChange={(event) => {
                  setBlankRevealCount(event.target.value);
                  clearError("blanks");
                }}
                className="mt-4 w-40"
              />
            </Surface>
          )}

          <Surface className="p-5">
            <Textarea
              id="problem-explanation"
              label="해설 (선택)"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              rows={3}
              placeholder="풀이 후 보여줄 해설을 입력하세요."
            />
          </Surface>
        </div>

        {/* 8.8: 오른쪽 4 — 이미지·참조 지문·태그 등 메타 영역 */}
        <div className="space-y-6 lg:col-span-4">
          <Surface className="p-5">
            <p className="text-body font-semibold text-ink-strong">이미지 (선택)</p>
            <p className="mt-1 text-body-small text-ink-muted">
              png, jpg, jpeg, gif, webp / 최대 5MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              aria-label="문제 이미지 선택"
              className="hidden"
              disabled={uploading}
              onChange={handleImageChange}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              loading={uploading}
              onClick={handleChooseImage}
            >
              {imageUrl ? "이미지 교체" : "이미지 선택"}
            </Button>

            {imageUrl && (
              <div className="mt-3 flex items-center gap-3 rounded-sm border border-line-default bg-surface-subtle p-2">
                <img src={imageUrl} alt="문제 이미지 미리보기" className="h-14 w-14 shrink-0 rounded-xs object-cover" />
                <div className="min-w-0 flex-1 text-body-small text-ink-default">
                  <p className="truncate font-medium text-ink-strong">{imageMeta?.name ?? "등록된 이미지"}</p>
                  {imageMeta?.size != null && <p className="text-ink-muted">{formatFileSize(imageMeta.size)}</p>}
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={handleRemoveImage}>
                  삭제
                </Button>
              </div>
            )}
            {imageError && <p className="mt-2 text-body-small text-danger-text">{imageError}</p>}
          </Surface>

          <Surface className="p-5">
            <Textarea
              id="problem-reference-text"
              label="참조 지문 (선택)"
              value={referenceText}
              onChange={(event) => setReferenceText(event.target.value)}
              rows={4}
              placeholder="문제 풀이에 필요한 참조 지문이 있다면 입력하세요."
            />
          </Surface>

          <Surface className="p-5">
            <Input
              id="problem-tags"
              label="태그 (콤마로 구분, 선택)"
              value={tagsInput}
              onChange={handleTagsInputChange}
              error={errors.tags}
              placeholder="예: 자바, 스프링"
            />
            {previewTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="선택된 태그">
                {previewTags.map((tag) => (
                  <TagChip key={tag} label={tag} onRemove={() => handleRemoveTag(tag)} />
                ))}
              </div>
            )}
          </Surface>
        </div>
      </div>

      {/* 귀속 부서 이동. 저장(PUT)과 다른 API(PATCH)라 버튼을 분리한다 — 한 버튼으로 묶으면
          한쪽만 성공하는 부분 실패가 생긴다. 총괄 관리자에게만 보인다. */}
      {canMoveDepartment && (
        <Surface className="p-5">
          <p className="text-body font-semibold text-ink-strong">귀속 부서 이동</p>
          <p className="mt-1 text-body-small text-ink-muted">
            이 문제를 다른 부서 소유로 옮깁니다. 위 저장과 별개로 즉시 적용됩니다.
          </p>
          <div className="mt-3 flex items-end gap-3">
            <Select
              id="problem-move-department"
              label="옮길 부서"
              value={moveDepartmentId}
              options={buildUploadDepartmentField({ session, departments }).options}
              onChange={(event) => setMoveDepartmentId(event.target.value)}
              className="w-64"
            />
            <Button type="button" variant="secondary" loading={moving} onClick={handleMoveDepartment}>
              부서 이동
            </Button>
          </div>
        </Surface>
      )}
    </form>
  );
}
