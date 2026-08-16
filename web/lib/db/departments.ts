import { asc, eq } from "drizzle-orm";
import type { DbConn } from "./client";
import { departments } from "./schema";

export async function findAllDepartments(db: DbConn) {
  return db.select().from(departments).orderBy(asc(departments.name));
}
export async function findDepartmentById(db: DbConn, id: number) {
  return (await db.select().from(departments).where(eq(departments.id, id)).limit(1))[0];
}
export async function findDepartmentByCode(db: DbConn, code: string) {
  return (await db.select().from(departments).where(eq(departments.code, code)).limit(1))[0];
}
export async function insertDepartment(db: DbConn, input: { name: string; code: string }) {
  const [row] = await db.insert(departments).values({ name: input.name, code: input.code, status: "ACTIVE" }).returning();
  return row;
}
export async function updateDepartment(db: DbConn, input: { id: number; name: string; status: string }) {
  await db.update(departments).set({ name: input.name, status: input.status }).where(eq(departments.id, input.id));
}
