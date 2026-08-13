-- attempts.submitted_answer 를 사람이 읽는 텍스트로 되돌리는 일회성 백필.
--
-- 배경: 이 컬럼은 풀이 이력 화면의 "제출 답안" 칸에 **그대로 표시되는 값**인데,
-- 예전 구현이 객관식·OX 는 선택지 ID 집합을 toString 한 값(`[104]`, `[58, 59]`)을,
-- 빈칸 채우기는 내부 키를 붙인 값(`b1=편성`)을 저장했다. 화면에 그대로 노출됐다.
-- 저장 로직은 SolveServiceImpl 에서 이미 고쳤고, 이 스크립트는 그 이전에 쌓인
-- 이력만 같은 형식으로 맞춘다.
--
-- 실행 방법 (dev 기준):
--   docker exec -i -e PGPASSWORD=probank_dev probank-postgres \
--     psql -U probank -d probank_dev -v ON_ERROR_STOP=1 \
--     < backend/db/backfill/2026-08-13-attempt-answer-summary.sql
--
-- 두 번 실행하면 백업 테이블 생성에서 곧바로 실패한다(CREATE TABLE, IF NOT EXISTS 아님).
-- 의도된 안전장치다 — 빈칸 답이 우연히 `x=1` 같은 모양이면 재실행 시 `1` 로 잘려
-- 데이터가 망가질 수 있어, 재실행 자체를 막는 편이 안전하다.
--
-- 되돌리려면:
--   UPDATE attempts a SET submitted_answer = b.submitted_answer
--   FROM attempts_answer_backup_20260813 b WHERE b.id = a.id;

BEGIN;

-- 1) 되돌릴 수 있게 원본을 통째로 남긴다.
CREATE TABLE attempts_answer_backup_20260813 AS
SELECT id, submitted_answer, now() AS backed_up_at
FROM attempts;

-- 2) 객관식 · OX: 선택지 ID 를 선택지 본문으로 바꾼다.
--    순서는 저장된 ID 순서가 아니라 문제에 정의된 선택지 순서(display_order)를 따른다.
--    저장된 ID 순서는 원래 Java 의 HashSet 순회 결과라 의미가 없다.
UPDATE attempts a
SET submitted_answer = s.text_summary
FROM (
    SELECT a.id,
           (
               SELECT string_agg(c.choice_text, ', ' ORDER BY c.display_order, c.id)
               FROM problem_choices c
               WHERE c.problem_id = a.problem_id
                 AND c.id IN (
                     SELECT trim(x)::bigint
                     FROM regexp_split_to_table(btrim(a.submitted_answer, '[]'), ',') AS x
                     WHERE trim(x) <> ''
                 )
           ) AS text_summary
    FROM attempts a
    JOIN problems p ON p.id = a.problem_id
    WHERE p.type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX')
      AND a.submitted_answer ~ '^\[[0-9, ]*\]$'
) s
WHERE a.id = s.id
  AND s.text_summary IS NOT NULL;

-- 3) 아무것도 고르지 않고 제출한 이력(`[]`)은 빈 문자열로 둔다. 새 저장 로직과 같고,
--    화면은 빈 값을 "-" 로 그린다. 아래 4)의 "삭제된 선택지"와 섞이지 않도록 먼저 처리한다.
UPDATE attempts a
SET submitted_answer = ''
FROM problems p
WHERE p.id = a.problem_id
  AND p.type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX')
  AND btrim(a.submitted_answer, '[] ') = '';

-- 4) 문제를 나중에 수정하면서 선택지가 지워진 경우, ID 로는 본문을 되살릴 수 없다.
--    내부 ID 를 그대로 두는 것이 이 작업이 없애려는 문제이므로 사람이 읽는 문구로 바꾼다.
UPDATE attempts a
SET submitted_answer = '(삭제된 선택지)'
FROM problems p
WHERE p.id = a.problem_id
  AND p.type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX')
  AND a.submitted_answer ~ '^\[[0-9, ]*\]$';

-- 5) 빈칸 채우기: 내부 키를 떼고 입력한 답만 남긴다.
--    빈칸을 비워 둔 경우는 채점 결과 화면과 같은 문구로 표시한다.
UPDATE attempts a
SET submitted_answer = s.text_summary
FROM (
    SELECT a.id,
           (
               SELECT string_agg(
                          CASE
                              WHEN btrim(substring(part FROM position('=' IN part) + 1)) = ''
                                  THEN '(미입력)'
                              ELSE substring(part FROM position('=' IN part) + 1)
                          END, ', ' ORDER BY ord)
               FROM regexp_split_to_table(a.submitted_answer, ',') WITH ORDINALITY AS t(part, ord)
           ) AS text_summary
    FROM attempts a
    JOIN problems p ON p.id = a.problem_id
    WHERE p.type = 'FILL_BLANK'
      AND a.submitted_answer ~ '^[A-Za-z0-9_-]+='
) s
WHERE a.id = s.id
  AND s.text_summary IS NOT NULL;

-- 6) 남은 옛 형식이 없는지 확인한다. 하나라도 남으면 커밋하지 않는다.
DO $$
DECLARE
    leftover integer;
BEGIN
    SELECT count(*) INTO leftover
    FROM attempts a
    JOIN problems p ON p.id = a.problem_id
    WHERE (p.type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX') AND a.submitted_answer ~ '^\[[0-9, ]*\]$')
       OR (p.type = 'FILL_BLANK' AND a.submitted_answer ~ '^[A-Za-z0-9_-]+=');
    IF leftover > 0 THEN
        RAISE EXCEPTION '옛 형식이 % 건 남았습니다. 롤백합니다.', leftover;
    END IF;
END $$;

COMMIT;
