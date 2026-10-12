import { z } from "zod";
import { loginStaff } from "@/lib/server/merchant/auth";
import {
  commerceOwner,
  commerceInput,
  privateJson,
} from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
const schema = z
  .object({ email: z.email().max(180), password: z.string().min(1).max(200) })
  .strict();
export async function POST(request: Request) {
  try {
    const input = await commerceInput(
      request,
      schema,
      await commerceOwner(true),
    );
    return privateJson(await loginStaff(input.email, input.password));
  } catch (error) {
    return apiError(error);
  }
}
