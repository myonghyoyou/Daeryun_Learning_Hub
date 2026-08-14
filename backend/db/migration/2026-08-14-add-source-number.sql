-- problems 에 출처 문항 번호를 추가한다. 영역은 department_id 가 겸하므로 컬럼은 하나다.
--
-- schema.sql 은 CREATE TABLE IF NOT EXISTS 라 이미 있는 테이블을 바꾸지 못한다.
-- 새로 만드는 DB 는 schema.sql 이, 이미 있는 DB 는 이 스크립트가 담당한다.
-- 둘을 함께 고쳐라.
--
-- 실행:
--   docker exec -i -e PGPASSWORD=probank_dev probank-postgres \
--     psql -U probank -d probank_dev -v ON_ERROR_STOP=1 \
--     < backend/db/migration/2026-08-14-add-source-number.sql
--
-- 두 문장 모두 IF NOT EXISTS 라 재실행해도 안전하다.

BEGIN;

ALTER TABLE problems ADD COLUMN IF NOT EXISTS source_number INT;

-- 기존 행의 source_number 는 NULL 이고, PostgreSQL 의 UNIQUE 는 NULL 을 서로 다른
-- 값으로 보므로 여러 행이 비어 있어도 충돌하지 않는다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_problems_department_source_number'
    ) THEN
        ALTER TABLE problems
            ADD CONSTRAINT uq_problems_department_source_number
            UNIQUE (department_id, source_number);
    END IF;
END $$;

COMMIT;
