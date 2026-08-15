export interface ErrorCodeEntry {
  code: number;
  message: string;
}

// 현재 ErrorCode enum 전체 이식. code·message 는 파리티 앵커라 글자까지 동일.
export const ErrorCode = {
  MSG_PROC_FAIL: { code: -1, message: "처리 중 오류가 발생하였습니다." },
  INPUT_VALUE_INVALID: { code: 1000, message: "잘못된 파라미터를 입력했습니다." },
  FILE_REQUIRED: { code: 1009, message: "필수 파일이 누락되었습니다." },
  ACCOUNT_LOCKED: { code: 1010, message: "계정이 잠겼습니다. 잠시 후 다시 시도하세요." },
  LOGIN_FAILED: { code: 1011, message: "사번 또는 비밀번호가 올바르지 않습니다." },
  PASSWORD_CHANGE_REQUIRED: { code: 1012, message: "비밀번호 변경이 필요합니다." },
  FILE_UNREADABLE: { code: 1013, message: "파일을 읽을 수 없습니다." },
  FILE_TYPE_NOT_ALLOWED: { code: 1014, message: "허용되지 않는 파일 형식입니다." },
  FILE_TOO_LARGE: { code: 1015, message: "파일 크기가 허용 범위를 초과했습니다." },
  EMPTY_SESSION: { code: 980, message: "세션 정보가 없습니다." },
  ACCESS_AUTH_DENIED: { code: 990, message: "접근 권한이 없습니다." },
} as const satisfies Record<string, ErrorCodeEntry>;
