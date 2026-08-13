CREATE TABLE IF NOT EXISTS departments (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    employee_no VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    department_id BIGINT NOT NULL REFERENCES departments(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'DEPT_ADMIN', 'EMPLOYEE')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problems (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX', 'SHORT_ANSWER', 'FILL_BLANK')),
    content TEXT NOT NULL,
    image_url VARCHAR(500),
    reference_text TEXT,
    explanation TEXT,
    blank_reveal_count INT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    department_id BIGINT NOT NULL REFERENCES departments(id),
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problem_choices (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    choice_text VARCHAR(500) NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS problem_answers (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    answer_text VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS problem_blanks (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    blank_key VARCHAR(50) NOT NULL,
    answer_text VARCHAR(500) NOT NULL,
    display_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    problem_id BIGINT NOT NULL REFERENCES problems(id),
    submitted_answer VARCHAR(500),
    is_correct BOOLEAN NOT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempt_blank_answers (
    id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    blank_key VARCHAR(50) NOT NULL,
    submitted_answer VARCHAR(500),
    is_correct BOOLEAN NOT NULL
);

-- 객관식/OX 제출에서 고른 보기. attempt_blank_answers 와 대칭 구조다.
--
-- choice_id 에 외래키를 걸지 않는 것은 의도다. 문제를 수정하면 ProblemServiceImpl.update()
-- 가 problem_choices 를 통째로 지우고 새 ID로 다시 넣기 때문에, ON DELETE CASCADE 는
-- 문제를 수정할 때마다 풀이 기록을 지워 버리고 RESTRICT 는 문제 수정을 막는다.
-- 대신 제출 시점의 보기 본문을 함께 남겨, 수정 뒤에도 무엇을 골랐는지는 보존한다.
-- choice_text 가 NULL 인 행은 과거 데이터를 백필하면서 원본 보기를 찾지 못한 경우다.
CREATE TABLE IF NOT EXISTS attempt_choices (
    id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    choice_id BIGINT NOT NULL,
    choice_text VARCHAR(500),
    UNIQUE (attempt_id, choice_id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_choices_choice_id ON attempt_choices(choice_id);

CREATE TABLE IF NOT EXISTS excel_upload_logs (
    id BIGSERIAL PRIMARY KEY,
    uploaded_by BIGINT NOT NULL REFERENCES users(id),
    department_id BIGINT REFERENCES departments(id), -- nullable: 계정 엑셀 업로드(Plan 2)는 총괄관리자가 여러 부서를 한 파일에 섞어 등록할 수 있어 단일 부서로 강제하지 않는다
    file_name VARCHAR(255) NOT NULL,
    total_rows INT NOT NULL,
    success_rows INT NOT NULL,
    fail_rows INT NOT NULL,
    error_detail TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problem_tags (
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (problem_id, tag_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT,
    detail JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE excel_upload_logs ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) NOT NULL DEFAULT 'PROBLEM'
    CHECK (target_type IN ('ACCOUNT', 'PROBLEM'));
