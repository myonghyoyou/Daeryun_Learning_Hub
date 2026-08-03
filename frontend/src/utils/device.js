export const MOBILE_BREAKPOINT = 768;

export function classifyDevice(viewportWidth) {
  return viewportWidth < MOBILE_BREAKPOINT ? "mobile" : "pc";
}
