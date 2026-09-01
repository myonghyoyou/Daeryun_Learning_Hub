# 운영 문제 → 로컬 동기화 설계

## 왜 만드는가

로컬 개발 DB에는 지금 테스트용으로 만든 문제 70개만 있다. 66개가 "개발팀"에, 4개가 "영업팀"에 몰려 있고 내용도 `V11 정상`, `X22 정상 OX` 같은 픽스처다. 반면 운영 DB에는 실제 문제은행이 부서별로 정리되어 들어가 있다.

이 차이 때문에 로컬에서는 실제와 같은 조건으로 확인할 수 없는 것들이 있다.

- 부서별로 문제가 흩어져 있을 때의 목록·검색·필터 동작
- 랜덤 출제가 실제 문항 수에서 어떻게 뽑히는지
- 통계 화면이 실제 분포에서 어떻게 보이는지
- 긴 본문·이미지·참고문·태그가 붙은 문제의 화면 깨짐

운영 데이터를 로컬로 가져와 **로컬을 운영의 사본으로 만드는 것**이 이 작업의 목표다.

## 무엇을 만드는가

명령어 두 개와 이를 묶는 명령어 하나.

| 명령어 | 하는 일 |
|---|---|
| `pnpm sync:problems:export` | 운영 DB에서 문제 데이터를 읽어 스냅샷 파일 하나로 저장 |
| `pnpm sync:problems:import` | 그 스냅샷 파일로 로컬 DB의 문제를 통째로 교체 |
| `pnpm sync:problems` | 위 둘을 순서대로 실행 |

### 왜 둘로 나누는가

한 번에 직통으로 복사하면 복사 로직(기존 데이터 삭제, 부서 짝맞추기, 번호 되돌리기) 전체가 운영 접속이 있어야만 돌아간다. 즉 **자동 테스트를 만들 수 없다.** 이 저장소는 테스트 1,020건으로 동작을 고정해 온 곳이라 그 손실이 크다.

둘로 나누면 까다로운 절반(`import`)을 스냅샷 픽스처 파일만으로 전부 테스트할 수 있다. 부수적으로 스냅샷을 눈으로 확인한 뒤 로컬을 지울지 결정할 수 있고, 운영을 다시 건드리지 않고 재실행할 수 있다.

## 안전장치

운영 DB를 실수로 건드리는 것과, 이 도구를 운영 DB에 대고 실행하는 것 두 가지를 모두 막는다.

**내보내기(운영 쪽) — 쓰기가 물리적으로 불가능해야 한다**

- 모든 조회를 `BEGIN TRANSACTION READ ONLY` 안에서 수행한다. 실수로 쓰기 구문이 섞여도 Postgres가 거부한다. "쓰지 않기로 한다"가 아니라 쓸 수 없게 만든다.
- `PROD_DATABASE_URL`의 호스트가 `localhost`/`127.0.0.1`/`::1`이면 **거부한다.** 운영용 자리에 로컬을 넣은 실수를 잡는다(`lib/devSeed.ts`의 `assertSeedableEnvironment`를 뒤집은 형태).

**들여오기(로컬 쪽) — 로컬이 아니면 실행되지 않아야 한다**

- 기존 `assertSeedableEnvironment(process.env)`를 **그대로 재사용한다.** `NODE_ENV=production`이거나 `DATABASE_URL` 호스트가 로컬이 아니면 던진다. `seed:dev`가 이미 쓰는 검증이라 새로 만들지 않는다.

**자격증명 취급**

- `PROD_DATABASE_URL`을 `web/.env`에 둔다. 이 파일은 이미 `.gitignore`에 있다.
- 스냅샷 파일은 `web/.data/`에 두고 이 경로를 `.gitignore`에 추가한다.
- **스냅샷에 사람 정보를 담지 않는다.** 운영 직원 계정(이름·이메일·비밀번호 해시)은 읽지도, 저장하지도 않는다.

## 스냅샷 파일 형식

`web/.data/prod-problems.json`. 문제마다 딸린 보기·정답·빈칸·태그를 그 문제 안에 넣는다 — 들여올 때 다루기 쉽고 사람이 열어봐도 읽힌다.

아래는 형식을 보이기 위한 예시다. 호스트 주소와 건수는 실제 운영 값이 아니라 자리를 채운 값이며, 운영 DB를 아직 읽어보지 않았으므로 실제 값은 첫 실행 때 확인한다.

`departments`에는 **운영의 부서를 전부** 담는다(문제가 없는 부서 포함). 로컬의 부서 목록도 운영과 같아져야 부서 필터·목록 화면을 실제와 같은 조건에서 볼 수 있다.

```json
{
  "version": 1,
  "generatedAt": "2026-09-01T06:00:00.000Z",
  "source": { "host": "aws-0-ap-northeast-2.pooler.supabase.com", "database": "postgres" },
  "counts": { "departments": 15, "problems": 724, "tags": 31 },
  "departments": [
    { "code": "CONST", "name": "공사관리팀", "status": "ACTIVE" }
  ],
  "problems": [
    {
      "id": 512,
      "type": "MCQ_SINGLE",
      "content": "문제 본문",
      "imageUrl": null,
      "referenceText": null,
      "explanation": "해설",
      "blankRevealCount": null,
      "status": "ACTIVE",
      "departmentCode": "CONST",
      "sourceNumber": 32,
      "createdAt": "2026-08-25T01:02:03.000Z",
      "updatedAt": "2026-08-25T01:02:03.000Z",
      "choices": [{ "choiceText": "보기1", "isCorrect": true, "displayOrder": 1 }],
      "answers": [{ "answerText": "정답" }],
      "blanks": [{ "blankKey": "a", "answerText": "정답", "displayOrder": 1 }],
      "tags": ["안전"]
    }
  ]
}
```

핵심은 **부서를 번호가 아니라 코드(`departmentCode`)로 적는다**는 점이다. 운영과 로컬은 부서의 내부 번호가 서로 다르므로, 번호를 그대로 옮기면 문제가 엉뚱한 부서에 붙는다. 코드는 양쪽에서 같은 값을 쓰는 유일한 열쇠다(`departments.code`에 유일 제약이 걸려 있다).

`createdBy`는 스냅샷에 담지 않는다. 운영 작성자 계정을 로컬로 가져오지 않기 때문이며, 들여올 때 로컬 총괄관리자로 대체한다.

## 들여오기 절차

트랜잭션 하나 안에서 아래 순서로 수행한다. 순서는 외래키가 강제하는 것이라 바꿀 수 없다.

1. **로컬 풀이 이력을 지운다** (`attempts`)
   문제를 지우려면 이게 먼저다. `attempts.problem_id`에는 연쇄 삭제가 걸려 있지 않아 DB가 문제 삭제를 거부한다. `attempt_choices`·`attempt_blank_answers`는 `attempts`에 연쇄 삭제가 걸려 있어 함께 사라진다.
2. **로컬 문제를 지운다** (`problems`)
   보기·정답·빈칸·문제태그는 `problems`에 연쇄 삭제가 걸려 있어 함께 사라진다.
3. **부서를 코드로 맞춘다**
   스냅샷의 부서 코드가 로컬에 없으면 만든다(이름·상태는 스냅샷 값). 이미 있으면 **건드리지 않는다** — 로컬에는 검증용으로 상태를 바꿔 둔 부서가 있을 수 있고, `seed:dev`도 같은 규칙을 쓴다.
4. **작성자를 정한다**
   로컬의 `SUPER_ADMIN` 중 번호가 가장 작은 계정. 없으면 `pnpm bootstrap` 또는 `pnpm seed:dev`를 먼저 돌리라는 안내와 함께 중단한다.
5. **문제를 넣는다** — 운영과 같은 `id`를 명시해 넣고, 부서만 로컬 번호로 바꾼다.
6. **보기·정답·빈칸을 넣는다** — 이들의 내부 번호는 아무도 참조하지 않으므로 새로 부여받게 둔다.
7. **태그를 맞추고 연결한다** — 이름으로 찾아 없으면 만든다(`findOrCreateTagsByNames` 재사용).
8. **번호표를 되돌린다** — `problems`의 자동 번호를 현재 최대값으로 맞춘다. 이걸 빼먹으면 로컬에서 문제를 새로 만들 때 이미 쓰인 번호를 다시 발급하려다 실패한다.

### 왜 운영과 같은 문제 번호를 쓰는가

"운영 512번 문제가 이상하다"는 말이 로컬에서도 512번으로 통해야 확인이 빠르다. 화면 주소(`/solve/512`)도 그대로 맞는다.

### 보관된 문제도 가져온다

운영에서 보관 처리된 문제도 포함한다. 부서별 문항 번호(`source_number`)는 한 번 쓰면 다시 쓰지 않는 규칙이라, 보관 문제를 빼면 번호에 구멍이 생겨 실제와 달라진다.

## 파일 구성

로직은 `lib/`에, 실행 진입점은 `scripts/`에 둔다. 저장소의 기존 관례(`scripts/seed-dev.ts` + `lib/devSeed.ts`)와 같다.

| 파일 | 책임 |
|---|---|
| `web/lib/problemSync/snapshot.ts` | 스냅샷 타입 정의, 조회 결과 → 스냅샷 변환, 스냅샷 형식 검증 |
| `web/lib/problemSync/exportSnapshot.ts` | 운영에서 읽어 스냅샷을 만든다(읽기 전용 트랜잭션, 비로컬 호스트 검증) |
| `web/lib/problemSync/importSnapshot.ts` | 스냅샷으로 로컬을 교체한다(위 8단계) |
| `web/scripts/sync-problems-export.ts` | `export` 진입점 |
| `web/scripts/sync-problems-import.ts` | `import` 진입점 |

기존 것을 재사용하는 부분:

- `assertSeedableEnvironment` (`web/lib/devSeed.ts`) — 들여오기 대상이 로컬인지 검증
- `findOrCreateTagsByNames`, `replaceProblemTags` (`web/lib/db/tags.ts`)
- `insertChoices`, `insertAnswers`, `insertBlanks` (`web/lib/db/problemParts.ts`)
- `findDepartmentByCode`, `insertDepartment` (`web/lib/db/departments.ts`)

`lib/db/client.ts`의 `getDb()`는 **쓰지 않는다.** 이 함수는 연결을 하나만 캐시해 두는 구조라 운영·로컬 두 곳에 동시에 붙을 수 없다. `postgres(url, { prepare: false })`로 각각 직접 연다(Supabase 풀러에는 `prepare: false`가 필수다).

문제 생성 서비스(`createProblem`)도 **쓰지 않는다.** 이 함수는 작성자를 현재 실행자로 덮어쓰고 부서를 권한 규칙으로 다시 정하며 감사 로그를 남긴다 — 원본을 그대로 옮기는 이 작업과 맞지 않는다. 더 낮은 층의 DAO를 직접 쓴다.

## 테스트

| 대상 | 방법 |
|---|---|
| 들여오기 전 과정 | `probank_test` DB에 픽스처 스냅샷을 넣어 검증. 기존 `testDb()`·`migrateTestDb()`·`truncateAll()` 사용 |
| 기존 데이터 삭제 | 풀이 이력이 있는 상태에서도 성공하는지(외래키 순서가 맞는지) |
| 부서 짝맞추기 | 로컬에 없는 코드는 생성, 있는 코드는 기존 부서 재사용·상태 미변경 |
| 문제 번호 보존 | 스냅샷의 `id`가 그대로 들어가는지 |
| 번호표 되돌리기 | 들여온 뒤 새 문제를 만들어도 번호가 충돌하지 않는지 |
| 스냅샷 형식 검증 | 잘못된/버전이 다른 스냅샷을 거부하는지 |
| 안전장치 | 비로컬 `DATABASE_URL`·`NODE_ENV=production`에서 거부하는지, 로컬 `PROD_DATABASE_URL`을 거부하는지 |

내보내기의 운영 접속 부분은 자동 테스트 대상이 아니다. 대신 조회 결과를 스냅샷으로 바꾸는 순수 변환 함수는 테스트한다.

## 다루지 않는 것

- **운영 계정 동기화** — 실제 직원 정보를 로컬에 두지 않는다. 로컬은 `seed:dev` 계정을 계속 쓴다.
- **로컬 → 운영 방향** — 이 도구는 한 방향뿐이다. 반대 방향은 만들지 않는다.
- **이미지 파일 복사** — 이미지는 Supabase에 있고 주소만 옮긴다. 로컬 앱은 이미 가진 키로 그 이미지를 불러올 수 있다.
- **감사 로그·엑셀 업로드 기록** — 문제와 직접 연결되지 않아 그대로 둔다. 감사 로그에 사라진 문제 번호가 남을 수 있으나 외래키가 없어 문제되지 않는다.
