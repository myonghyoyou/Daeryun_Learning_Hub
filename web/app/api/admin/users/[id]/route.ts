import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { updateAccount } from "@/lib/admin/userAdminService";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await context.params;
    const idNum = parseNumericParam(id, "id")!;
    const body = await readJson(request);
    await updateAccount(getDb(), idNum, {
      name: asStringField(body.name), email: asStringField(body.email),
      departmentId: typeof body.departmentId === "number" ? body.departmentId : Number(asStringField(body.departmentId)) || undefined,
      role: asStringField(body.role), status: asStringField(body.status),
    }, actor); // 보호 규칙이 actor 본인 여부를 봐야 하므로 actor 전체를 넘긴다
    return undefined;
  });
}
