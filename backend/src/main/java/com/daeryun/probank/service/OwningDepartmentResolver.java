package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Component;

/**
 * 문제가 귀속될 부서를 정하는 단일 규칙. 엑셀 업로드({@link ExcelProblemUploadServiceImpl})와
 * 개별 등록({@link ProblemServiceImpl})이 이 클래스 하나만 사용한다.
 * <p>
 * 규칙은 조회 경로({@code ProblemServiceImpl.list})와 같다 — 총괄 관리자만 요청값을 쓰고, 부서
 * 관리자는 요청값을 무시하고 본인 부서로 강제된다. <b>화면의 disabled 는 실수 방지일 뿐이므로
 * 파라미터 위조는 여기서 막는다.</b>
 * <p>
 * 두 서비스에 각각 구현하지 않는 이유는 {@code ImageUrlValidator}와 같다: 규칙을 복제하면 한쪽만
 * 고쳐지고 다른 쪽은 남는 드리프트가 생기는데, 이건 보안 판정이라 그 드리프트의 대가가 크다.
 */
@Component
public class OwningDepartmentResolver {

    private final DepartmentDao departmentDao;

    public OwningDepartmentResolver(DepartmentDao departmentDao) {
        this.departmentDao = departmentDao;
    }

    /**
     * @param requested 총괄 관리자가 지정한 부서 id. 부서 관리자에게는 무시된다.
     * @return 실제로 귀속시킬 부서 id
     */
    public Long resolve(Long requested, AuthUser actor) {
        if (actor.getRole() != UserRole.SUPER_ADMIN) {
            return actor.getDepartmentId();
        }
        if (requested == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "문제가 귀속될 부서를 선택하세요.");
        }
        Department department = departmentDao.findById(requested);
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        if (department.getStatus() != Status.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "비활성 부서에는 문제를 등록할 수 없습니다: " + department.getName());
        }
        return requested;
    }
}
