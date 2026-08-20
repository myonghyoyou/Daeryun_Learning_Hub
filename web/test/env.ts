// 테스트는 .env 를 읽지 않는다.
//
// `import "dotenv/config"` 를 쓰면 파일 전체가 process.env 에 실리고, 거기에는 앱용
// DATABASE_URL(=probank_dev)이 들어 있다. vitest 는 fileParallelism:false 라 모든 테스트
// 파일이 한 프로세스를 공유하므로, 그런 파일이 하나만 있어도 스위트 전체의 testDb() 가
// 개발 DB 를 향하고 truncateAll 이 그걸 비운다. 실제로 그렇게 됐었다(test/db.ts 주석 참고).
//
// Supabase 자격증명은 값이 있기만 하면 되는 것들이다 — 스토리지 클라이언트는 목이고,
// "키가 로그에 새지 않는다" 단언도 여기 세운 가짜 키를 그대로 쓰면 성립한다.
// 진짜 키를 끌어오면 단언이 더 강해지지도 않으면서 비밀만 테스트 프로세스에 들어온다.
process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test_only_not_a_real_key";
