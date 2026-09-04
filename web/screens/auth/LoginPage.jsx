import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import {
  Eye,
  EyeSlash,
  Info,
  LockSimple,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { login } from "@/apiClient/auth.js";
import { ApiError, resolveErrorMessage } from "@/apiClient/client.js";
import { refetchSession, useSessionStore } from "@/store/sessionStore.js";

/**
 * 세션 만료로 다시 /login에 진입했음을 알리는 계약.
 * `@/apiClient/sessionRedirects.js`의 setOnSessionExpired 리스너가 resultCode 980을
 * 감지하면 `/login?reason=session-expired`로 이동시키고,
 * 이 페이지가 폼 상단에 "세션이 만료되었습니다" 안내를 표시한다.
 *
 * Task 7: 같은 상태 전이에서 ProtectedLayout(resolvePrivateRedirect)도 독립적으로
 * 하드코딩된 "/login"(파라미터 없음)으로 router.replace()를 호출하는 경합이 있다.
 * 두 effect 중 어느 쪽이 나중에 이기느냐에 따라 이 쿼리 파라미터가 유실될 수
 * 있으므로, URL 파라미터 **또는** sessionStore의 expired 플래그 중 하나만 참이어도
 * 배너를 띄운다 — 파라미터 지원은 유지한다(정답지 L1이 직접 URL 진입 동작을 고정).
 */
const SESSION_EXPIRED_REASON = "session-expired";

// 8.1.4: 모바일에서 자동 확대를 방지하려면 입력 글자 크기가 16px 미만이면 안 된다.
// 디자인 시스템의 type-body 토큰(14px)보다 우선하는 의도된 예외이며, text-base(16px)를 쓴다.
const inputBaseClass =
  "h-11 w-full rounded-sm border bg-surface-default px-3 text-base text-ink-strong placeholder:text-ink-subtle " +
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua";

function fieldBorderClass(hasError) {
  return hasError ? "border-danger-text" : "border-line-default";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(() => {
    // 둘 중 하나만 참이어도 배너를 띄운다: URL 파라미터(직접 진입 시나리오,
    // 정답지 L1)와 sessionStore.expired(경합에서 파라미터가 유실된 시나리오, Task 7).
    const viaParam = searchParams.get("reason") === SESSION_EXPIRED_REASON;
    const viaStore = useSessionStore.getState().expired;
    if (viaParam || viaStore) {
      return { tone: "info", message: "세션이 만료되었습니다. 다시 로그인해 주세요." };
    }
    return null;
  });

  const employeeNoRef = useRef(null);
  const isLocked = banner?.tone === "locked";

  function validate() {
    const nextErrors = {};
    if (!employeeNo.trim()) {
      nextErrors.employeeNo = "사번을 입력하세요.";
    }
    if (!password) {
      nextErrors.password = "비밀번호를 입력하세요.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner(null);
    if (!validate()) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await login({ employeeNo, password });
      // Task 13의 세션 스토어는 캐시된 상태를 스스로 재조회하지 않는다.
      // navigate()는 클라이언트 라우팅만 수행하므로, refetchSession()으로
      // 캐시를 무효화하지 않으면 PrivateRoute/PublicRoute가 로그인 이전의
      // "unauthenticated" 상태를 그대로 읽어 다시 /login으로 돌려보낸다.
      await refetchSession();
      if (result.mustChangePassword) {
        router.replace("/change-password");
      } else {
        router.replace("/");
      }
    } catch (error) {
      const message = resolveErrorMessage(error, "로그인에 실패했습니다.");
      const isLockedError = error instanceof ApiError && error.resultCode === 1010;
      setBanner({ tone: isLockedError ? "locked" : "error", message });
      toast.error(message);
      // 인증 실패 시 입력값은 유지하고 사번 필드로 포커스만 되돌린다.
      employeeNoRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  const bannerToneClass = {
    info: "border-line-default bg-info-bg text-info-text",
    error: "border-line-default bg-danger-bg text-danger-text",
    locked: "border-line-default bg-danger-bg text-danger-text",
  };

  return (
    <div
      className="flex min-h-screen justify-center bg-surface-page px-5 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] md:px-0 md:pt-[12vh] md:pb-16"
    >
      <div className="w-full max-w-110">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="w-full rounded-lg border border-line-default bg-surface-default p-8 shadow-surface"
        >
          {/*
            로고만 남기고 제목·안내 문구는 화면에서 뺐다 — 사번/비밀번호 칸과 버튼만으로
            무엇을 하는 화면인지 충분히 읽힌다.

            다만 h1 을 통째로 지우지는 않고 sr-only 로 남긴다. 로고가 alt="" 인 장식 이미지라,
            제목까지 없애면 화면 낭독기에는 이름 없는 폼 하나만 남는다.
          */}
          <img src="/logo.png" alt="" className="mx-auto mb-2 h-20 w-auto" />
          <h1 className="sr-only">문제 은행 Hub 로그인</h1>

          <div aria-live="polite">
            {banner && (
              <div
                role="alert"
                className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-body-small ${bannerToneClass[banner.tone]}`}
              >
                {banner.tone === "info" ? (
                  <Info size={18} className="mt-0.5 shrink-0" />
                ) : banner.tone === "locked" ? (
                  <LockSimple size={18} className="mt-0.5 shrink-0" />
                ) : (
                  <WarningCircle size={18} className="mt-0.5 shrink-0" />
                )}
                <span>{banner.message}</span>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="employeeNo" className="mb-1 block text-label font-bold text-ink-default">
                사번
              </label>
              <input
                id="employeeNo"
                ref={employeeNoRef}
                className={`${inputBaseClass} ${fieldBorderClass(Boolean(fieldErrors.employeeNo))}`}
                placeholder="사번을 입력하세요"
                value={employeeNo}
                onChange={(event) => {
                  setEmployeeNo(event.target.value);
                  if (fieldErrors.employeeNo) {
                    setFieldErrors((prev) => ({ ...prev, employeeNo: undefined }));
                  }
                  // 잠금 계정 배너가 뜬 채로 제출 버튼이 영구히 막히지 않도록,
                  // 사번을 고쳐서 다른 계정으로 시도하려는 신호로 보고 잠금 상태를 해제한다.
                  if (isLocked) {
                    setBanner(null);
                  }
                }}
                autoComplete="username"
                autoFocus
                aria-invalid={Boolean(fieldErrors.employeeNo)}
                aria-describedby={fieldErrors.employeeNo ? "employeeNo-error" : undefined}
              />
              {fieldErrors.employeeNo && (
                <p id="employeeNo-error" className="mt-1 text-body-small text-danger-text">
                  {fieldErrors.employeeNo}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-label font-bold text-ink-default">
                비밀번호
              </label>
              <div className="relative">
                <input
                  id="password"
                  className={`${inputBaseClass} pr-11 ${fieldBorderClass(Boolean(fieldErrors.password))}`}
                  type={showPassword ? "text" : "password"}
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }
                  }}
                  autoComplete="current-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center text-ink-muted focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1 text-body-small text-danger-text">
                  {fieldErrors.password}
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || isLocked}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-action-primary-bg text-body font-semibold text-white transition-colors hover:bg-action-primary-hover disabled:opacity-45 disabled:hover:bg-action-primary-bg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
          >
            {submitting && <SpinnerGap size={18} className="animate-spin" />}
            {submitting ? "로그인 중" : "로그인"}
          </button>

          <p className="mt-4 text-center text-caption text-ink-muted">
            계정 관련 문의는 정보시스템팀 류명효로 연락해 주세요.
          </p>
        </form>
      </div>
    </div>
  );
}
