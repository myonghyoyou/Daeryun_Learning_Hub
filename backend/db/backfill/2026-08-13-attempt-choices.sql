-- 표시 형식 백필(2026-08-13-attempt-answer-summary.sql) 이전에 쌓인 객관식·OX 시도의
-- 보기 선택을 attempt_choices 로 옮긴다. 원본 보기 ID 는 그 백필의 백업 테이블에만 남아 있다.
--
-- 실행:
--   docker exec -i -e PGPASSWORD=probank_dev probank-postgres \
--     psql -U probank -d probank_dev -v ON_ERROR_STOP=1 \
--     < backend/db/backfill/2026-08-13-attempt-choices.sql
--
-- ON CONFLICT DO NOTHING 이라 재실행해도 안전하다.

BEGIN;

-- schema.sql 은 백엔드가 뜰 때 실행된다. 이 스크립트를 재기동 전에 돌리는 경우를 위해
-- 같은 DDL 을 여기에도 둔다(IF NOT EXISTS 라 중복 실행돼도 무해하다).
-- schema.sql 을 고치면 이 블록도 함께 고쳐라.
CREATE TABLE IF NOT EXISTS attempt_choices (
    id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    choice_id BIGINT NOT NULL,
    choice_text VARCHAR(500),
    UNIQUE (attempt_id, choice_id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_choices_choice_id ON attempt_choices(choice_id);

WITH parsed AS (
    SELECT b.id AS attempt_id,
           a.problem_id,
           trim(x)::bigint AS choice_id
    FROM attempts_answer_backup_20260813 b
    JOIN attempts a ON a.id = b.id
    JOIN problems p ON p.id = a.problem_id
    CROSS JOIN LATERAL regexp_split_to_table(btrim(b.submitted_answer, '[]'), ',') AS x
    WHERE p.type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX')
      AND b.submitted_answer ~ '^\[[0-9, ]*\]$'
      AND trim(x) <> ''
)
INSERT INTO attempt_choices (attempt_id, choice_id, choice_text)
SELECT parsed.attempt_id, parsed.choice_id, c.choice_text
FROM parsed
LEFT JOIN problem_choices c
       ON c.id = parsed.choice_id AND c.problem_id = parsed.problem_id
ON CONFLICT (attempt_id, choice_id) DO NOTHING;

COMMIT;
