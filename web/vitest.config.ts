import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // `server-only` 는 "react-server" export 조건이 없으면 무조건 throw 한다(클라이언트로
      // 오인해서). 그 조건을 global 로 켜면 react/react-dom 의 react-server 전용 빌드까지
      // 걸려 useState 같은 클라이언트 훅이 없는 버전으로 바뀐다 — 이 저장소엔 아직 그런
      // 테스트가 없어 안 터질 뿐이다. 대신 `server-only` 패키지 하나만 그 무해한
      // empty.js 로 직접 alias 해서, 다른 패키지의 조건부 resolve 는 건드리지 않는다.
      "server-only": resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.js", "**/*.test.jsx"],
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
