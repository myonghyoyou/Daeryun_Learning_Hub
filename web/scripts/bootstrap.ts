// tsx 는 .env 를 로드하지 않는다(drizzle-kit 은 한다). 이 import 가 없으면 .env 가
// 채워져 있어도 getDb() 가 "DATABASE_URL 이 설정되지 않았습니다." 로 죽는다.
// 부수효과 import 라 다른 import 보다 먼저 와야 한다.
import "dotenv/config";

import { getDb } from "../lib/db/client";
import { bootstrap } from "../lib/bootstrap";

bootstrap(getDb())
  .then(() => {
    console.log("bootstrap 완료");
    process.exit(0);
  })
  .catch((error) => {
    console.error("bootstrap 실패", error);
    process.exit(1);
  });
