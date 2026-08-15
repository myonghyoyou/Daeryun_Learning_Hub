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
