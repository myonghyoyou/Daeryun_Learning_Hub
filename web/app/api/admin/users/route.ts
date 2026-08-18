import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { createAccount, listAccounts } from "@/lib/admin/userAdminService";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    await requireActor("SUPER_ADMIN");
    const raw = new URL(request.url).searchParams.get("departmentId");
    return listAccounts(getDb(), parseNumericParam(raw, "departmentId")); // 잘못된 값 → 400+1000(Spring 미러)
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const body = await readJson(request);
    return createAccount(getDb(), {
      employeeNo: asStringField(body.employeeNo), name: asStringField(body.name), email: asStringField(body.email),
      departmentId: typeof body.departmentId === "number" ? body.departmentId : Number(asStringField(body.departmentId)) || undefined,
      role: asStringField(body.role),
    }, actor.userId);
  });
}
