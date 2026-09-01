/** @type {import('next').NextConfig} */
const nextConfig = {
  // `@phosphor-icons/react` 는 배럴(패키지 루트) import 하나에 dist 9,086개 파일이 딸려 온다.
  // Next 의 기본 최적화 목록(next/dist/server/config.js)에 이 패키지는 빠져 있어 직접 지정해야 한다.
  // 지정하면 실제로 쓰는 아이콘만 끌어온다 — 개발 서버 컴파일 대상이 1만 개대에서 1천 개 아래로 떨어진다.
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};
export default nextConfig;
