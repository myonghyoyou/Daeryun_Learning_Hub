# 서브플랜 5(풀이) 파리티 정답지

> **이 문서가 계약이다.** 서브플랜 4에서 리뷰가 네 번 증명한 것: **정답지 행이 틀리면 검증이
> 틀린 것을 합격시킨다.** 여기 적힌 값은 전부 `backend/` 소스를 직접 읽어 실측한 것이고,
> 인용은 `파일:줄` 이다. 구현자와 검증자는 행의 주장이 아니라 **인용된 Java 를 열어** 확인하라.

- 작성일: 2026-08-21
- 대상: `SolveController` 4 + `AttemptController` 1 + `TagController.listInUse` 1 = **6개 엔드포인트**
- 근거: `SolveServiceImpl.java`(240줄), `TagServiceImpl.java`, MyBatis 매퍼 5개, `GlobalExceptionHandler.java`
- 총 **86행** (E 7 · S 11 · P 12 · Q 14 · G 15 · T 13 · H 8 · U 6)
- **실측 상태**: 소스 정독 후 **Spring 인스턴스를 띄워 E·P·Q·G·T·H·U 를 직접 호출해 대조했다.**
  그 과정에서 초안의 **2행(E5·P2)이 틀린 것을 발견해 고쳤다.** 아래 "실측 기록" 참고

---

## E. 권한·공통

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| E1 | 두 컨트롤러에 `@RequireRole` 이 **없다** | 로그인만 하면 누구나 — SUPER_ADMIN·DEPT_ADMIN·EMPLOYEE 전부 통과 | `SolveController.java:11-13`, `AttemptController.java:12-13` (클래스·메서드 어디에도 애노테이션 없음) |
| E2 | 비로그인 | 401 / 980 — 세션 필터가 컨트롤러 진입 전에 막는다 | 포트는 `middleware.ts` + `evaluateGate` 가 이미 동일하게 동작(서브플랜 1·2에서 확인됨) |
| E3 | `mustChangePassword=true` 인 사용자 | 200 / PASSWORD_CHANGE_REQUIRED — `/api/auth/**` 외 전부 차단 | `web/lib/auth/gate.ts:19-23` (기존 포트) |
| E4 | 직원이 **남의 부서** 문제를 상세 조회 | **허용된다.** 부서 스코프가 없다 | `SolveServiceImpl.java:60-91` — `getDetail` 은 `actor` 파라미터 자체가 없다. 관리자 상세(`assertOwnership`)와 정반대다 |
| E5 | 경로 변수 타입 불일치(`/api/problems/abc`) | 400 / 1000 / **`요청 값의 형식이 올바르지 않습니다: id`** — **파라미터 이름이 문구에 붙는다** | `GlobalExceptionHandler.java:63-72`. 메시지는 `"요청 값의 형식이 올바르지 않습니다: " + exception.getName()` 로 조립된다(`:69`). 실측 확인 |
| E5-1 | **여러 규칙이 동시에 깨졌을 때의 순서** | **경로변수 → 본문 → 문제 조회** 순으로 먼저 걸린 것이 나간다. 실측: 잘못된 id + 깨진 본문 → `요청 값의 형식이 올바르지 않습니다: id`(400) / 없는 문제 + 깨진 본문 → **`잘못된 파라미터를 입력했습니다.`(200)** / 없는 문제 + 정상 본문 → `존재하지 않거나 보관된 문제입니다.`(400) | Spring 이 `@PathVariable`(0번 인자)을 `@RequestBody`(1번)보다 먼저 해석하고, 서비스는 그 뒤에 들어간다. **라우트가 본문을 문제 조회 뒤에 읽으면 두 번째 줄이 뒤집힌다** |
| E6 | `submit` 본문이 JSON 이 아님 | 200 / 1000 / `errorList` 없음 | `GlobalExceptionHandler.java:48-50` (`HttpMessageNotReadable` → 필드오류 null) — 서브플랜 4 의 `MessageNotReadableError` 와 같은 모양 |

---

## S. 풀이 목록 — `GET /api/problems`

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| S1 | 기본 호출 | **페이지네이션이 없다.** 조건에 맞는 활성 문제 전체를 배열로 반환 | `SolveController.java:21-25`(파라미터가 keyword·tag 뿐), `ProblemMapper.xml:13` |
| S2 | 보관(ARCHIVED) 문제 | 제외 — `WHERE p.status = 'ACTIVE'` | `ProblemMapper.xml:13` |
| S3 | `keyword` | `p.content ILIKE '%값%'` — **대소문자 무시** | 같은 곳 |
| S4 | `tag` | `EXISTS (... lower(ft.name) = lower(#{tag}))` — 대소문자 무시, 정확 일치(부분 일치 아님) | 같은 곳 |
| S5 | `keyword=` 또는 `tag=` (빈 문자열) | 필터 **미적용** — `<if test="... != null and ... != ''">` | 같은 곳. 빈 문자열을 필터로 쓰면 결과가 달라진다 |
| S5-1 | **`keyword=   ` (공백만)** | **필터를 적용한다** → `ILIKE '%   %'` → **0건**. 빈 문자열(S5)과 **다르다** | 실측. MyBatis `<if test="keyword != null and keyword != ''">` 의 OGNL 비교는 `"   ".equals("")` 가 false 라 **참**이다. `tag=` 한 칸도 같다(0건). 포트가 `trim()` 후 진리값으로 판단하면 이 행이 어긋난다 |
| S6 | `tags` 필드 | `array_agg(DISTINCT t.name)` → **이름 오름차순**. 태그가 없으면 `'{}'` → 빈 배열(null 아님) | 같은 곳. `COALESCE(..., '{}')` |
| S7 | 정렬 | `ORDER BY p.created_at DESC` — **`p.id` 타이브레이커가 없다** | 같은 곳. 관리자 목록(`p.created_at DESC, p.id DESC`)과 다르다. 페이지네이션이 없어 중복·누락이 생기지 않으므로 **그대로 이식한다** |
| S8 | 응답 필드 | `id, type, content, tags, departmentName, sourceNumber` — **정답 관련 필드 없음** | `ProblemSolveListItem.java` |
| S9 | 부서 필터 | **없다.** 직원은 전 부서 문제를 본다 | `SolveController.java:21-25` |
| S10 | 태그가 여러 개 붙은 문제 | `GROUP BY p.id, d.name` 이라 행이 부풀지 않는다 | `ProblemMapper.xml:13` |

---

## P. 랜덤 세트 — `GET /api/problems/random`

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| P1 | `count` 누락 | **200 / -1 / `처리 중 오류가 발생하였습니다.`** — `@RequestParam int count` 는 필수이고 `MissingServletRequestParameterException` 을 받는 핸들러가 없어 catch-all 로 떨어진다 | `SolveController.java:27-31`, `GlobalExceptionHandler.java:85-88`. **실측 확인**(아래 "실측 기록"). 이탈 후보 ㉮ 참고 |
| P2 | `count=abc` | 400 / 1000 / **`요청 값의 형식이 올바르지 않습니다: count`** — E5 와 같은 형식으로 **파라미터 이름이 붙는다** | `GlobalExceptionHandler.java:63-72`. 실측 확인 |
| P3 | `count=0` 또는 `count=-1` | 400 / 1000 / **`문제 수는 1 이상 50 이하여야 합니다.`** | `SolveServiceImpl.java:51-54` |
| P4 | `count=51` | 같은 문구 | 같은 곳. `MAX_RANDOM_COUNT = 50` (`SolveServiceImpl.java:19`) |
| P5 | `count=1` · `count=50` | 통과 — 경계 포함 | 조건이 `count < 1 || count > 50` 이다 |
| P6 | 조건에 맞는 문제가 `count` 보다 적음 | **오류가 아니다.** 있는 만큼 반환 | `SolveServiceImpl.java:55-56` (주석에 명시) |
| P7 | `departmentId` | 선택적. 주면 `AND p.department_id = #{departmentId}` | `ProblemMapper.xml:29` |
| P8 | 정렬·필터 | `ORDER BY random() LIMIT #{count}`. **keyword·tag 필터는 없다** | 같은 곳. 응답 형식은 목록과 동일(`solveProblemListItemMap`, `ProblemMapper.xml:9`) |
| P9 | **`?count=` (값이 빈 문자열)** | **400 / 1000 / `요청 값의 형식이 올바르지 않습니다: count`** — P1(누락)과 **다른 경로다.** 값은 있으나 `int` 로 변환되지 않는 쪽이다 | 실측. 포트의 `parseNumericParam` 은 빈 문자열을 **null(미지정)** 로 취급하므로 그대로 쓰면 이 분기가 P1 로 새거나 `count=null` 이 흘러간다 — 라우트에서 갈라야 한다 |
| P10 | `?count=1.5` | 400 / 1000 / `요청 값의 형식이 올바르지 않습니다: count` | 실측. 포트의 `parseNumericParam` 은 `Number.isSafeInteger` 로 거르므로 그대로 일치한다 |
| P10-1 | **`Number()` 는 Spring 의 숫자 변환과 같지 않다** | 실측 — Spring: `1e2`→**거부**, `<공백1>`→**거부**, `"1 0"`→**200/10건**(공백을 전부 지운다), `0x10`→200/16건, `+5`→200/5건. 포트의 `parseNumericParam` 은 앞의 셋에서 갈린다(`1e2`→100, `" "`→0, `"1 0"`→거부) | **승인된 이탈 ㉲.** `parseNumericParam` 은 서브플랜 3·4가 이미 쓰고 있어 지금 바꾸면 파급이 크다. P10(`1.5`)은 우연히 일치할 뿐 **일반적으로 일치하지 않는다** |
| P11 | `departmentId` 의 빈 문자열·없는 부서 | `departmentId=` → **필터 미적용**(200). `departmentId=99999` → **200 / 0건** (부서 존재 검증 없음). `departmentId=abc` → 400 / `요청 값의 형식이 올바르지 않습니다: departmentId` | 실측. `count` 와 **비대칭**이다 — `count` 는 필수 원시형이라 빈 문자열이 오류지만 `departmentId` 는 선택적 `Long` 이라 무시된다 |

---

## Q. 풀이 상세 — `GET /api/problems/{id}` (정답 비노출)

> **이 절이 서브플랜 5의 핵심이다.** 파리티가 맞아도 정답이 새면 제품이 망가진다.

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| Q1 | 없는 id 또는 ARCHIVED | 400 / 1000 / **`존재하지 않거나 보관된 문제입니다.`** (두 경우가 **같은 문구**) | `SolveServiceImpl.java:61-64` |
| Q2 | MCQ_SINGLE·MCQ_MULTI·OX | `choices = [{id, text}]` — **`correct` 플래그가 없다** | `SolveServiceImpl.java:78-82`, `ChoiceOption.java` |
| Q3 | `ChoiceOption` 필드명 | **`text`** 다. `choiceText` 가 아니다 | `ChoiceOption.java` — 서브플랜 4 의 `correct`/`isCorrect` 함정(D2)과 같은 종류다. DB 행을 그대로 spread 하면 필드명이 어긋난다 |
| Q4 | SHORT_ANSWER | `choices`·`blanksToAnswer`·`revealedBlanks` **전부 null** | `SolveServiceImpl.java:66-68, 78` — `else if (type != SHORT_ANSWER)` 라 단답은 어느 분기에도 안 들어간다 |
| Q5 | FILL_BLANK → `blanksToAnswer` | 무작위로 고른 **`blankRevealCount` 개의 빈칸 키 배열** | `SolveServiceImpl.java:70-73, 94-98` |
| Q6 | FILL_BLANK → `revealedBlanks` | 고르지 **않은** 나머지 빈칸의 `{blankKey, answerText}` — **정답이 그대로 나간다** | `SolveServiceImpl.java:74-77`. 설계 의도다(안 물어보는 칸은 채워서 보여 준다). 정답 비노출 규칙의 **예외**이므로 구현자가 "정답이 샌다"고 판단해 막으면 안 된다 |
| Q6-1 | `blankRevealCount` 가 전체 빈칸 수와 같을 때 | `revealedBlanks` 는 **빈 배열 `[]`** 이다 — **null 이 아니다** | 실측(문제 12, 빈칸 2개·revealCount 2 → `[]`). `stream().filter().collect()` 이므로 항상 리스트가 만들어진다(`:74-77`). SHORT_ANSWER 의 null(Q4)과 **구분해야 한다** |
| Q7 | FILL_BLANK → `choices` | null | `SolveServiceImpl.java:70-77` 분기 |
| Q8 | 무작위 선택 방식 | `Collections.shuffle(keys, SecureRandom)` 후 `subList(0, min(count, size))` | `SolveServiceImpl.java:94-98` |
| Q9 | `blankRevealCount` > 실제 빈칸 수 | `min` 이라 전체 반환 — 오류 아님 | 같은 곳. 생성 검증(`ProblemServiceImpl.java:441`)이 `<= blanks.size()` 를 강제하므로 실제로는 도달 불가 |
| Q10 | `departmentName` | `departmentDao.findById` 로 **별도 조회**. 부서가 없으면 **null** | `SolveServiceImpl.java:84-90` (null 가드 명시) |
| Q11 | `explanation` | **응답에 없다.** 채점 후에만 나온다 | `ProblemSolveDetailResponse.java` 필드 목록에 없음 |
| Q12-1 | **상세를 반복 호출하면 제출 없이 모든 정답을 모을 수 있다** | 매 호출마다 다시 뽑고 **선택을 저장하지 않는다.** 빈칸 3개·revealCount 1 이면 한 번에 2개가 공개되고, 두 번이면 사실상 전부 모인다 | `SolveServiceImpl.java:70-77` — Java 도 똑같다. **파리티이므로 막지 마라**(막으려면 무엇을 보여 줬는지 저장하는 새 상태가 필요하다). 다만 이 구간의 목표가 "정답 비노출"이므로 **한계를 알고 있어야 한다** — 서브플랜 6(통계)이 부정행위 탐지를 다룬다면 여기가 출발점이다. 컷오버 이월 |
| Q12 | `imageUrl` | 저장된 값 그대로 | `SolveServiceImpl.java:88`. **비공개 버킷 조회 경로는 아직 미결정 — 아래 "미결정" 절 참고** |

---

## G. 채점 — `POST /api/problems/{id}/attempts`

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| G1 | 없는 id 또는 ARCHIVED | 400 / 1000 / `존재하지 않거나 보관된 문제입니다.` (Q1 과 같은 문구) | `SolveServiceImpl.java:102-105` |
| G2 | MCQ·OX 판정 | **집합 동등성** — `정답 id 집합.equals(제출 id 집합)` | `SolveServiceImpl.java:117-121` |
| G3 | `selectedChoiceIds` 가 null | 빈 집합으로 취급 → 정답 집합이 비어있지 않으면 오답 | `SolveServiceImpl.java:119-120` |
| G4 | 같은 id 를 두 번 제출 | `HashSet` 이라 접힌다 → 판정에 영향 없음 | 같은 곳 |
| G5 | 다른 문제의 choiceId 제출 | 집합 불일치 → 오답. `selectedChoices` 필터에도 안 걸려 **`attempt_choices` 에 아무것도 안 들어간다** | `SolveServiceImpl.java:123-125` |
| G6 | SHORT_ANSWER 판정 | 허용 정답 중 **하나라도** normalize 일치하면 정답 | `SolveServiceImpl.java:130-132` (`anyMatch`) |
| G7 | `normalize` 규칙 | `trim().toLowerCase().replaceAll("\\s+", " ")`, null → `""` | `SolveServiceImpl.java:209-211` |
| G7-1 | **공백은 접히지만 없어지지는 않는다** | 정답 `보정계수` 에 `  보정계수  ` 제출 → **정답**. `보정 계수` 제출 → **오답** | 실측(문제 44). `\s+` → `" "` 는 연속 공백을 하나로 줄일 뿐 제거하지 않는다. 구현이 공백을 **삭제**하면 오답이 정답이 된다 — 이 두 케이스가 판별자다 |
| G8 | `toLowerCase()` 로케일 | 포트는 **JS `toLowerCase()`** 를 쓴다. **`toLocaleLowerCase()` 를 쓰지 마라** | 정확히 말하면 Java 의 무인자 `String.toLowerCase()` 는 **`Locale.getDefault()` 를 쓰므로 로케일에 의존한다**(터키어 `I`→`ı`). JS `toLowerCase()` 는 유니코드 기본 변환이라 로케일과 무관하다. **한글·ASCII 에서는 두 결과가 같으므로** 실무상 차이가 없고, JS 쪽이 서버 로케일 설정에 흔들리지 않아 더 안전하다. `toLocaleLowerCase()` 를 쓰면 그 안전성을 스스로 버리는 것이다 |
| G9 | FILL_BLANK — 중복 키 제출 | 400 / 1000 / **`제출한 빈칸 개수가 올바르지 않습니다.`** | `SolveServiceImpl.java:144` (`submittedKeys.size() != submitted.size()`) |
| G10 | FILL_BLANK — 정의되지 않은 키 | **같은 문구** | `SolveServiceImpl.java:145` (`!definedKeys.containsAll(...)`) |
| G11 | FILL_BLANK — 개수 불일치 | **같은 문구** | `SolveServiceImpl.java:146` (`!= blankRevealCount`). **세 조건이 한 `if` 로 묶여 있어 문구가 구분되지 않는다 — 나눠서 다른 문구를 내면 파리티 위반** |
| G12 | FILL_BLANK 판정 | **전부 맞아야 정답.** 부분 점수 없음 | `SolveServiceImpl.java:152-159` (`allCorrect &= blankCorrect`) |
| G13 | `blankResults` 항목 | `{blankKey, submittedAnswer, correct, correctAnswer}` — **채점 후에는 정답을 공개한다** | `BlankAnswerResult.java`, `SolveServiceImpl.java:157` |
| G14 | 응답 | `{correct, explanation, blankResults}`. FILL_BLANK 가 아니면 `blankResults` 는 null | `AttemptResult.java`, `SolveServiceImpl.java:201` |

---

## T. 시도 저장

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| T1 | `attempts` insert | `user_id, problem_id, submitted_answer, is_correct` | `AttemptMapper.xml:5` |
| T2 | 500자 초과 요약 | **잘라서 저장**(오류 아님) — `submitted_answer` 는 `varchar(500)` | `SolveServiceImpl.java:170-172` |
| T2-1 | 저장되는 값은 **제출 원문** | `normalize` 는 **채점 비교용일 뿐** 저장에는 쓰이지 않는다. `  보정계수  ` 를 제출하면 앞뒤 공백까지 그대로 저장된다. null 제출은 컬럼도 NULL | 실측(시도 40=`  보정계수  `, 42=NULL). `SolveServiceImpl.java:133` 이 `request.getSubmittedText()` 를 그대로 쓴다 |
| T3 | MCQ 요약 문자열 | 선택지 **본문**을 `", "` 로 join. **문제에 정의된 순서**(제출 순서 아님) | `SolveServiceImpl.java:223-228` + 주석 `:213-222`. 실측 판별: `[10,9]` 로 제출해도 `가, 나` 로 저장된다(시도 37) — 제출 순서였다면 `나, 가` 였을 것 |
| T4 | FILL_BLANK 요약 문자열 | 제출 답만 `", "` join. 비었거나 공백뿐이면 **`(미입력)`** | `SolveServiceImpl.java:234-239` |
| T5 | `attempt_choices` | `selectedChoices` 가 비어있지 **않을 때만** insert | `SolveServiceImpl.java:178-187` |
| T6 | `attempt_choices.choice_text` | 저장 시점 **스냅샷**. 나중에 선택지 문구가 바뀌어도 이력은 안 바뀐다 | `SolveServiceImpl.java:183` + 주석 `:220-221` |
| T7 | `attempt_blank_answers` | `blankResults != null` 일 때(=FILL_BLANK) insert | `SolveServiceImpl.java:189-199` |
| T8 | **`submit` 에 `@Transactional` 이 없다** | `attempts` insert 가 먼저 커밋되고 자식 insert 가 뒤따른다. 자식이 실패하면 **부모만 남는다** | `SolveServiceImpl.java:100-101`(애노테이션 없음), 클래스도 `@Service` 뿐(`:15-16`). **이탈 ㉯ 참고** |
| T8-1 | **빈칸 답이 500자를 넘으면 실제로 그 상태가 된다 — 실측된 결함** | **200 / -1 / `처리 중 오류가 발생하였습니다.`** 를 받지만 `attempts` 행은 **이미 커밋돼 남는다.** 채점 결과가 기록되고 빈칸 상세는 0행 | 부모는 500자로 **자르지만**(`SolveServiceImpl.java:170-172`, 주석이 "insert 실패를 막는다"고 밝힌다) 자식은 **자르지 않는다**(`:194` 가 `r.getSubmittedAnswer()` 원문을 그대로 넣는다). 컬럼은 둘 다 `varchar(500)`. **실측**: 600자 제출 → `attempts` 18→19, 마지막 시도(id 47) `submitted_answer` 500자 · 빈칸행 **0개** |
| T8-2 | T8-1 의 실질 피해 | 사용자는 실패로 보이니 **다시 제출한다** → 시도가 2건이 되고 하나는 고아다. 서브플랜 6 통계가 둘 다 센다 | `SolveServiceImpl.java:176-177` 주석이 `attempt_choices` 를 "통계의 유일한 소스"라고 못 박는다. 빈칸도 같은 구조 |
| T9 | `insertAll` 의 빈 컬렉션 | `<foreach>` 에 가드가 없어 `VALUES` 뒤가 비면 **SQL 문법 오류**. `blankRevealCount >= 1` 검증(`ProblemServiceImpl.java:441`) 때문에 도달 불가 | `AttemptChoiceMapper.xml:5`, `AttemptBlankAnswerMapper.xml:5`. 포트는 **이 경로를 도달 가능하게 만들지 말 것** |
| T10 | `attempt_choices` 유일성 | `(attempt_id, choice_id)` unique — 중복 제출이 `HashSet` 에서 접히므로 위반 불가 | `web/lib/db/schema.ts` `uqAttemptChoice` |

---

## H. 내 이력 — `GET /api/attempts/me`

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| H1 | 범위 | **본인 것만** — `WHERE a.user_id = #{userId}` | `AttemptMapper.xml:10` |
| H2 | 정렬 | `ORDER BY a.submitted_at DESC` — 타이브레이커 없음 | 같은 곳 |
| H3 | 페이지네이션 | **없다.** 전체 반환 | `AttemptController.java:22-25` |
| H4 | **`a.is_correct AS correct`** | 별칭이 **반드시** 필요하다. 빼면 `mapUnderscoreToCamelCase` 가 `isCorrect` 로 만들어 DTO 의 `correct` 에 안 붙고 **항상 false** 가 된다 | `AttemptMapper.xml:10` 의 주석이 이 함정을 직접 경고한다. 서브플랜 4 D2 와 같은 계열 |
| H5 | 응답 필드 | `problemId, problemContent, submittedAnswer, correct, submittedAt, departmentName, sourceNumber` | `AttemptHistoryItem.java` |
| H6 | 조인 | `problems`·`departments` 모두 **INNER JOIN** | `AttemptMapper.xml:10`. 문제가 사라지면 이력도 안 나오지만, 문제는 보관만 되고 삭제되지 않으므로 실제로는 무해 |
| H7 | 보관된 문제의 이력 | **나온다.** `p.status` 조건이 없다 | 같은 곳. 목록(S2)과 다르다 |
| H8 | 이력 0건 | 빈 배열 | 같은 곳 |

---

## U. 활성 태그 — `GET /api/tags/in-use`

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| U1 | 범위 | **ACTIVE 문제에 하나라도 붙어 있는 태그만** | `TagMapper.xml:12` |
| U2 | 정렬·중복 | `SELECT DISTINCT ... ORDER BY t.name` | 같은 곳 |
| U3 | 응답 필드 | `id, name, created_at` — `Tag` 도메인 그대로 | 같은 곳. 관리자 `GET /api/tags`(`TagMapper.xml:5`)와 동일한 형태 |
| U4 | 관리자 목록과의 차이 | `/api/tags` 는 `findAll`(전체), `/api/tags/in-use` 는 활성 문제 기준 — **다른 쿼리다** | `TagMapper.xml:5` vs `:12`. 매퍼 주석이 이유를 적어 뒀다("고르면 반드시 0건이 나오는 선택지가 생기지 않도록") |
| U5 | 권한 | `@RequireRole` 없음 — 로그인만 하면 누구나 | `TagController.java:15-16` 의 클래스 주석이 명시 |
| U6 | **포트 현황** | `findInUseTags` DAO 와 테스트 2건이 **서브플랜 4에서 이미 만들어졌다.** 서브플랜 5는 `web/app/api/tags/in-use/route.ts` 만 추가하면 된다 | `web/lib/db/tags.ts:16-24`, `web/lib/db/tags.test.ts:67,74` |

---

## 미결정 — 비공개 버킷의 이미지 조회 경로

서브플랜 4(M6)가 업로드와 URL 형식(`/api/problem-images/<uuid>.<ext>`)까지만 확정하고 **조회
경로를 서브플랜 5로 넘겼다.** Q12 가 이 결정에 걸려 있다.

- 버킷은 비공개다(`public=false` 실측). 익명 공개 URL 접근은 400 으로 차단된다.
- 선택지: **서명 URL**(만료 시간을 붙여 발급) vs **프록시 라우트**(`GET /api/problem-images/[key]`
  에서 세션을 확인하고 서버가 대신 받아 내보낸다).
- 어느 쪽이든 **로그인 게이트는 유지**한다(이관 설계 Q8).
- Spring 은 로컬 디스크를 정적 리소스로 서빙했으므로 **파리티 대상이 아니다** — 승인된 이탈 ①
  (이미지 저장 이관)의 연장이다.
- 알아 둘 것: `problems.image_url` 이 **삭제된 오브젝트를 가리키는 행이 1건** 있다(M7 이 버킷을
  비우면서 생겼고 `docs/qa/2026-08-19-problem-bank-e2e-verification.md` I12 에 기록됐다).
  조회 경로를 만들면 이 행이 **첫 테스트 케이스**가 된다 — 없는 오브젝트에 어떤 응답을 낼지.

---

## 이탈 후보 (계획서 작성 시 승인 필요)

| # | 항목 | Spring | 제안 | 근거 |
|---|---|---|---|---|
| ㉮ | `count` 파라미터 누락(P1) | 200 / **-1** / `처리 중 오류가 발생하였습니다.` | 400 / 1000 / `잘못된 파라미터를 입력했습니다.` | 서브플랜 3·4가 같은 모양(`MissingServletRequestPart` → catch-all)을 **승인된 이탈 ⑥** 으로 개선했다. 같은 원리를 적용하면 세 서브플랜이 일관된다. 반대 의견: 이건 파트가 아니라 파라미터라 별개 이탈 번호가 필요하다 |
| ㉯ | `submit` 이 비트랜잭션이고 자식 답안을 자르지 않는다(T8·T8-1) | 600자 빈칸 답 → **200 / -1**, 그런데 `attempts` 행은 커밋돼 남는다 | **① 한 트랜잭션으로 묶고 ② 자식도 부모와 같은 규칙(500자)으로 자른다** | **이론이 아니라 실측된 결함이다.** 사용자는 `-1` 을 보고 다시 제출하고, 통계는 고아 시도까지 센다 — 이 이관이 없애려던 QA-1 과 같은 계열이다. 부모의 자르기 주석(`:170`)이 "insert 실패를 막는다"고 밝히고 있으므로, 자식을 자르는 것은 **원저자 의도의 완성**이지 새 동작이 아니다. 트랜잭션은 그 위의 안전망 |
| ㉲ | 숫자 파라미터 변환(P10-1) | `NumberUtils.parseNumber` — 공백을 전부 제거한 뒤 `Integer.valueOf`(16진수는 `decode`) | JS `Number()` + `Number.isSafeInteger` | `parseNumericParam` 은 **서브플랜 3·4가 이미 쓰는 공유 헬퍼**다. 지금 바꾸면 이미 검증된 두 서브플랜의 동작이 함께 움직인다. 실무상 문제되는 입력(`1e2`·`"1 0"`)은 화면에서 생성되지 않는다 — 컷오버 목록으로 넘긴다 |
| ㉰ | 목록·이력에 페이지네이션 없음(S1·H3) | 전체 반환 | **그대로 이식** | 722문항 규모에서 전체 반환은 감당 가능하고, 페이지네이션을 넣으면 프론트 계약이 바뀐다. 성능은 컷오버 후 실측해서 판단 |

---

## 실측 기록 (2026-08-21)

초안을 소스만 읽고 쓴 뒤, **`./gradlew bootRun` 으로 Spring 을 띄워(8080, DB 는 로컬
`probank_dev` 로 동일) 전 절을 직접 호출해 대조했다.** 서브플랜 4에서 "이웃 산출물에 대한
확인 없는 단언"이 반복된 실패였고, Ruling 13 이 정확히 이 종류의 추론에서 틀렸기 때문이다.

**초안이 틀렸던 곳 2행 — 실측이 아니었으면 그대로 계약이 됐을 것:**

| 행 | 초안 | 실제 |
|---|---|---|
| E5 | `잘못된 파라미터를 입력했습니다.` | **`요청 값의 형식이 올바르지 않습니다: id`** |
| P2 | 같은 문구로 적었다 | **`요청 값의 형식이 올바르지 않습니다: count`** |

`INPUT_VALUE_INVALID`(1000) 를 쓰니 문구도 같으리라 가정한 것이 원인이다. 실제로는 타입 불일치
핸들러만 **파라미터 이름을 붙여 별도 문구를 조립한다**(`GlobalExceptionHandler.java:69`).

**추론이 맞았던 것:** P1(`count` 누락 → 200/-1/`처리 중 오류가 발생하였습니다.`). 핸들러 목록에
`MissingServletRequestParameterException` 이 없고 `GlobalExceptionHandler` 가
`ResponseEntityExceptionHandler` 를 **상속하지 않는** 평범한 `@ControllerAdvice` 임을 확인한 뒤
실제 호출로 확정했다.

**실측으로 새로 얻어 행이 된 것:** Q6-1(빈 배열 vs null), G7-1(공백 접힘의 판별자),
T2-1(저장은 제출 원문), T3 의 순서 판별(`[10,9]` → `가, 나`).

**정답 비노출 확인:** 5개 유형 전부 상세 응답에 `correct`·`explanation` 키가 하나도 없다.
`explanation` 은 채점 응답에서만 나오는 것을 해설 있는 문제(id 35)로 확인했다. **`answerText`
는 예외가 있다 — Q6 이 명시하듯 FILL_BLANK 의 `revealedBlanks[]` 안에는 안 물어보는 칸의
`answerText` 가 의도적으로 들어간다.** 이 실측 문장이 "5개 유형 전부에 answerText 가 없다"로
읽히면 그 예외를 버그로 오인해 지우게 된다 — 실제로 측정 당시 호출한 FILL_BLANK 문제가
`revealCount == blanks.size()`(전부 물어보는 문제)였을 뿐이라 `revealedBlanks`가 우연히
비어 있었고, 그래서 이 문장이 참으로 보였다. `revealCount < blanks.size()` 인 문제로
호출하면 `answerText` 가 나온다 — 이것이 정답이다(Q6).

**H4 함정 확인:** 이력의 `correct` 가 boolean 이고 `true` 인 항목이 실제로 있다 — `AS correct`
별칭이 동작한다는 증거다. 별칭이 없으면 전부 false 가 됐을 것이다.

**프론트 호출부 대조 완료:** `frontend/src/api/solve.js:8,12,16,20,27` 과
`api/problems.js:11,16` 의 URL 6개가 이 문서와 정확히 일치한다. 서브플랜 4 M2 에서 계획서가
엔드포인트 URL 을 틀리게 적어 프론트가 404 를 삼킨 사고가 있었으므로 확인했다.
부수적으로 `fetchRandomSet` 이 **항상 `count` 를 보내므로**(`solve.js:25`) P1 은 실제 화면에서는
발생하지 않는다 — 이탈 ㉮ 의 실질 위험이 낮다는 뜻이다.

**검증 중 만든 데이터:** `probank_dev` 에 admin 계정의 **시도 18건**(+ `attempt_choices` 10행,
`attempt_blank_answers` 4행)이 생겼다. 개발 환경이고 H 절 검증에 필요해 **그대로 뒀다.**

**정답지를 쓰다 Spring 결함을 하나 찾았다 — T8-1.** 빈칸 답을 600자로 제출하면 `200/-1` 이
나오는데 `attempts` 행은 이미 커밋돼 남는다(실측: 18→19건, 마지막 시도 id 47 이 빈칸행 0개인
고아 상태). 부모는 500자로 자르면서 자식은 자르지 않기 때문이다. 사용자는 실패로 보고 다시
제출하므로 시도가 중복되고, 서브플랜 6 통계가 둘 다 센다. **이탈 ㉯ 가 이걸 닫는다.**

**아직 실측하지 않은 것:** T2(주관식 요약 500자 초과 잘림 — 정상 경로), T9(빈 컬렉션 insert).
둘 다 정상 경로로는 유도되지 않는다 — 계획서에서 단위 테스트로 고정할 것.
