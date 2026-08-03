import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { CheckCircle, Circle, Eye, EyeSlash, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { changePassword } from "@/api/auth.js";
import { resolveErrorMessage } from "@/api/client.js";
import { refetchSession } from "@/store/sessionStore.js";

const MIN_LENGTH = 8;

const inputBaseClass =
  "h-11 w-full rounded-sm border border-line-default bg-surface-default px-3 pr-11 text-body text-ink-strong " +
  "placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [banner, setBanner] = useState(null);

  const lengthValid = newPassword.length >= MIN_LENGTH;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner(null);

    if (newPassword.length < MIN_LENGTH) {
      toast.error(`비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ newPassword });
      // 서버 세션의 mustChangePassword 플래그가 false로 바뀌었으므로,
      // 로그인 때와 동일한 이유로 캐시된 세션 스토어를 무효화해야 한다.
      // 그렇지 않으면 navigate("/") 이후 mustChangePassword 값을 참조하는
      // 화면/가드가 여전히 true를 읽어 이 화면으로 되돌아올 수 있다.
      await refetchSession();
      toast.success("비밀번호가 변경되었습니다.");
      navigate("/", { replace: true });
    } catch (error) {
      const message = resolveErrorMessage(error, "비밀번호 변경에 실패했습니다.");
      setBanner(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen justify-center bg-surface-page px-5 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] md:px-0 md:pt-[12vh] md:pb-16">
      <div className="w-full max-w-[400px]">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="w-full max-w-[440px] mx-auto rounded-lg border border-line-default bg-surface-default p-8 shadow-surface"
        >
          <h1 className="text-center text-page-title font-extrabold tracking-title text-ink-strong">
            비밀번호 변경
          </h1>
          <p className="mt-2 text-center text-body-small text-ink-default">
            최초 로그인 시 비밀번호를 변경해야 합니다.
          </p>

          <div aria-live="polite" className="mt-6">
            {banner && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-sm border border-line-default bg-danger-bg px-3 py-2 text-body-small text-danger-text"
              >
                <WarningCircle size={18} className="mt-0.5 shrink-0" />
                <span>{banner}</span>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="newPassword" className="mb-1 block text-label font-bold text-ink-default">
                새 비밀번호
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  className={inputBaseClass}
                  type={showNewPassword ? "text" : "password"}
                  placeholder="새 비밀번호"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                  aria-pressed={showNewPassword}
                  className="absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center text-ink-muted focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
                >
                  {showNewPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div
                className={`mt-1 flex items-center gap-1 text-body-small ${
                  lengthValid ? "text-success-text" : "text-ink-muted"
                }`}
              >
                {lengthValid ? (
                  <CheckCircle size={14} weight="fill" />
                ) : (
                  <Circle size={14} />
                )}
                <span>비밀번호는 {MIN_LENGTH}자 이상이어야 합니다.</span>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-label font-bold text-ink-default">
                새 비밀번호 확인
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  className={`${inputBaseClass} ${mismatch ? "border-danger-text" : ""}`}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="새 비밀번호 확인"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  aria-invalid={mismatch}
                  aria-describedby={mismatch ? "confirmPassword-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                  aria-pressed={showConfirmPassword}
                  className="absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center text-ink-muted focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
                >
                  {showConfirmPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {mismatch && (
                <p id="confirmPassword-error" className="mt-1 text-body-small text-danger-text">
                  비밀번호가 일치하지 않습니다.
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-action-primary-bg text-body font-semibold text-white transition-colors hover:bg-action-primary-hover disabled:opacity-45 disabled:hover:bg-action-primary-bg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
          >
            {submitting && <SpinnerGap size={18} className="animate-spin" />}
            {submitting ? "변경 중" : "변경하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
