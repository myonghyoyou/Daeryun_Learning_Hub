import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // 통합 테스트가 하나의 probank_test DB를 공유한다. 파일을 병렬로 돌리면 한 파일의
    // truncateAll 이 다른 파일의 insert 를 지워 플래키해진다. 파일은 직렬로 실행한다.
    fileParallelism: false,
    // TZ 를 고정한다. lib/http/timestamp.test.ts 가 "오프셋 없는 텍스트를 로컬시로 잘못
    // 파싱하면 안 된다"는 회귀를 잡는 테스트인데, TZ 를 안 고정하면 그 판별력이 이 머신이
    // 우연히 Asia/Seoul 인지에 의존한다 — UTC 러너(CI)에서는 같은 변이가 통과해 버린다.
    // 테스트를 실행하는 모든 곳에서 항상 로컬시 오프셋(0 이 아닌 값)이 존재하도록 고정한다.
    env: { TZ: "Asia/Seoul" },
  },
});
