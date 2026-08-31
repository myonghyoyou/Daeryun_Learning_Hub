// 로컬 개발 DB 를 채우는 시드 데이터와 안전 가드. scripts/seed-dev.ts 가 쓴다.
//
// 저장소에 시드가 없어 QA 계정이 재현되지 않던 상태를 메운다. 운영 DB 는 빈 상태에서
// 시작한다는 배포 결정(spec 2026-08-14-deployment D8)은 그대로 유지해야 하므로,
// 이 시드는 로컬 DB 에서만 돌아야 한다 — assertSeedableEnvironment 가 그걸 강제한다.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * 시드를 돌려도 되는 환경인지 확인하고, 아니면 던진다.
 *
 * 호스트 검사만으로는 부족하다. 누군가 운영 셸에서 로컬 터널을 열어 두면 호스트는
 * localhost 인데 실제로는 운영 DB 일 수 있어, NODE_ENV 도 함께 본다.
 */
export function assertSeedableEnvironment(env: { DATABASE_URL?: string; NODE_ENV?: string }): void {
  if (env.NODE_ENV === "production") {
    throw new Error("NODE_ENV=production 에서는 시드를 돌릴 수 없습니다.");
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
  }

  let host: string;
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    // 파싱 실패를 "확인할 수 없으니 통과"로 처리하면 가드가 무의미해진다.
    throw new Error(`DATABASE_URL 을 URL 로 해석할 수 없습니다: ${env.DATABASE_URL}`);
  }

  // new URL 은 IPv6 를 대괄호째 hostname 에 넣지 않지만, 구현 차이를 타지 않게 벗겨 둔다.
  const bare = host.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(bare)) {
    throw new Error(`로컬 DB 가 아닙니다(host=${host}). 시드는 로컬에서만 돌릴 수 있습니다.`);
  }
}

export type SeedDepartment = { name: string; code: string };
export type SeedUser = {
  employeeNo: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "DEPT_ADMIN" | "EMPLOYEE";
  departmentCode: string;
};

// 부트스트랩이 만드는 부서와 같은 코드(HQ)를 쓴다.
//
// 이름은 "본사"가 아니라 "공통"이다. 원본 문제은행의 첫 구획이 `▣ 공통문제`이고
// 변환 파일도 `문제_01_공통.xlsx` 다 — spec 2026-08-13-source-number-and-random-50 이
// 12개 그룹을 "공통 · 기획팀 · …"으로 명시한다. 같은 문서 D1 이 남겨 둔 "부서 마스터
// 정리"에서 이 하나만 누락돼 공통문제 46문항이 부트스트랩의 "본사"에 들어가 있었다.
//
// bootstrap.ts 의 HQ_NAME 은 건드리지 않는다 — 그건 운영 부트스트랩까지 바꾸는 일이라
// 이 로컬 시드의 권한 밖이다. 대신 seed-dev.ts 가 로컬 DB 에서만 이름을 맞춰 준다.
export const HQ: SeedDepartment = { name: "공통", code: "HQ" };

// 로컬 DB 에 이미 있는 실무 팀 14개. DB 를 밀어도 시드 한 번으로 돌아오도록 여기 적어 둔다.
export const SEED_TEAMS: SeedDepartment[] = [
  { name: "정보시스템팀", code: "DEV" },
  { name: "영업팀", code: "SALES" },
  { name: "안전기획팀", code: "SAFE" },
  { name: "신성장사업팀", code: "NEWBIZ" },
  { name: "기술팀", code: "TECH" },
  { name: "기획팀", code: "PLAN" },
  { name: "업무지원팀", code: "SUPPORT" },
  { name: "회계팀", code: "ACCT" },
  { name: "자금팀", code: "FUND" },
  { name: "총무1팀", code: "GA1" },
  { name: "고객지원팀", code: "CS" },
  { name: "수입관리팀", code: "REV" },
  { name: "인사팀", code: "HR" },
  { name: "공사관리팀", code: "CONST" },
];

// 정책은 8자 이상뿐이다(lib/auth/authService.ts MIN_PASSWORD_LENGTH).
export const SEED_PASSWORD = "Test1234!";

/**
 * 총괄관리자 1명 + 팀마다 부서관리자·직원 1명씩.
 *
 * 사번은 부서 코드를 접두어로 써서 기존 QA 계정(admin, deptadmin, emp001, dev_admin 등)과
 * 겹치지 않게 한다 — 겹치면 employee_no unique 제약에 걸린다.
 */
export function buildSeedUsers(): SeedUser[] {
  const users: SeedUser[] = [
    { employeeNo: "sadmin", name: "시드총괄관리자", email: "sadmin@example.com", role: "SUPER_ADMIN", departmentCode: HQ.code },
  ];
  for (const team of SEED_TEAMS) {
    const prefix = team.code.toLowerCase();
    users.push({
      employeeNo: `${prefix}_mgr`,
      name: `${team.name}관리자`,
      email: `${prefix}_mgr@example.com`,
      role: "DEPT_ADMIN",
      departmentCode: team.code,
    });
    users.push({
      employeeNo: `${prefix}_emp`,
      name: `${team.name}직원`,
      email: `${prefix}_emp@example.com`,
      role: "EMPLOYEE",
      departmentCode: team.code,
    });
  }
  return users;
}
