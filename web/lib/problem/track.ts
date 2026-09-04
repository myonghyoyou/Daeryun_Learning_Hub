/**
 * 직군. 행정직(ADMIN)과 기술직(TECH) 두 가지뿐이다.
 *
 * 이 값은 **사람의 속성이 아니라 로그인할 때 고르는 화면 필터**다. 서버는 맞는지 확인하지
 * 않는다 — 두 직군의 문제은행은 이미 사내 파일서버에 서로 열려 있어 감출 대상이 아니고,
 * 목적은 접근 차단이 아니라 화면 정리다. 그래서 모르는 값이 와도 거절하지 않는다.
 */
export type Track = "ADMIN" | "TECH";

export const DEFAULT_TRACK: Track = "ADMIN";

const KNOWN: readonly string[] = ["ADMIN", "TECH"];

/** 모르는 값·없는 값은 행정직으로 읽는다. 배포 전에 발급된 세션 토큰이 이 경로를 탄다. */
export function parseTrack(value: unknown): Track {
  return typeof value === "string" && KNOWN.includes(value) ? (value as Track) : DEFAULT_TRACK;
}
