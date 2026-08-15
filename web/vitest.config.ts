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
  },
});
