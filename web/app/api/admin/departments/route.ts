import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { requireActor } from "@/lib/auth/currentUser";
import { createDepartment, listDepartments } from "@/lib/admin/departmentService";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    await requireActor("SUPER_ADMIN");
    return listDepartments(getDb());
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const body = await readJson(request);
    await createDepartment(getDb(), { name: asStringField(body.name), code: asStringField(body.code) }, actor.userId);
    return undefined; // ok()
  });
}
