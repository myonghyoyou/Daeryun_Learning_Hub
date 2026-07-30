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
