import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { updateDepartmentInfo } from "@/lib/admin/departmentService";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await context.params;
    const idNum = parseNumericParam(id, "id")!; // Spring 타입불일치 미러(400+1000)
    const body = await readJson(request);
    await updateDepartmentInfo(getDb(), idNum, { name: asStringField(body.name), status: asStringField(body.status) }, actor.userId);
    return undefined;
  });
}
