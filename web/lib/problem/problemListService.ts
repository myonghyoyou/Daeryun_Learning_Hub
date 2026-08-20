import type { DbConn } from "../db/client";
import {
  listProblems as selectProblemRows, countProblems,
  type ProblemListFilters, type ProblemListItem,
} from "../db/problems";
import type { AuthUser } from "../auth/types";

// ProblemServiceImpl.java:37-38. 상한은 방어다 — 클라이언트가 size=100000 을 보내면
// 페이징이 없는 것과 같아지고, 한 번의 조회가 문제은행 전체를 메모리로 끌어온다(정답지 L3).
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** 정답지 L1 의 아홉 파라미터. 날짜 두 개는 라우트에서 `parseDateParam` 이 만든다. */
export type ProblemListRequest = ProblemListFilters & { page: number; size: number };

/** 정답지 L14: ProblemServiceImpl.java:190-193 의 ProblemPageResponse 와 필드·순서가 같다. */
export interface ProblemPageResponse {
  items: ProblemListItem[];
  totalCount: number;
  page: number;
  size: number;
}

/**
 * 목록 조회의 **부서 규칙**(ProblemServiceImpl.java:183-185, 정답지 L16·R7).
 *
 * 이 코드베이스의 세 번째 부서 규칙이며, 앞의 둘과 다르다:
 *  - 쓰기 경로(등록·엑셀·다음번호)는 `resolveOwningDepartment`(R5·R8~R10)
 *  - 상세·수정·보관은 `assertOwnership`(R6)
 *  - 목록은 여기 이 규칙
 *
 * **`resolveOwningDepartment` 를 재사용하면 안 된다.** 총괄 관리자에게 `departmentId == null`
 * 은 "전 부서"라는 뜻인데, 그 해석기는 바로 그 입력에 "문제가 귀속될 부서를 선택하세요." 를
 * 던진다 — 문제은행 전체 열람이 통째로 막힌다.
 */
function effectiveDepartmentId(actor: AuthUser, requested: number | null): number | null {
  return actor.role === "SUPER_ADMIN" ? requested : actor.departmentId;
}

/**
 * 역할 스코프·클램프·페이지 조립만 한다. SQL 은 전부 `lib/db/problems.ts` 의 두 DAO
 * (`listProblems`·`countProblems`)에 있고, 둘은 같은 필터 조각을 공유한다.
 *
 * 총건수를 먼저 세고 목록을 읽는 순서도 Java 와 같다(:190-192). 마지막 페이지에서 목록이
 * 비어도 총건수는 그대로 나가야 화면의 페이저가 어긋나지 않는다.
 */
export async function listProblems(
  conn: DbConn, actor: AuthUser, request: ProblemListRequest,
): Promise<ProblemPageResponse> {
  const size = request.size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(request.size, MAX_PAGE_SIZE);
  const page = Math.max(request.page, 1);
  const filters: ProblemListFilters = {
    departmentId: effectiveDepartmentId(actor, request.departmentId),
    type: request.type,
    status: request.status,
    createdFrom: request.createdFrom,
    createdTo: request.createdTo,
    tag: request.tag,
    keyword: request.keyword,
  };

  const totalCount = await countProblems(conn, filters);
  const items = await selectProblemRows(conn, { ...filters, limit: size, offset: (page - 1) * size });
  return { items, totalCount, page, size };
}
