const ADMIN_ROLES = ["SUPER_ADMIN", "DEPT_ADMIN"];

export function canAccessAdmin({ device, role }) {
  return device === "pc" && ADMIN_ROLES.includes(role);
}

export function resolveLandingPath({ device, role }) {
  return canAccessAdmin({ device, role }) ? "/admin" : "/solve";
}
