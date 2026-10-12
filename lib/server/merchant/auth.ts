import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  commerceDatabase,
  commerceEnvironment,
  requireSecret,
} from "../commerce-config";
import { sandboxDatabaseConfig } from "../payment-config";
import { RequestError } from "../http";
import { fetchWithTimeout } from "../supabase";
const cookieName = () => `ruvon_${commerceEnvironment()}_staff`;
export async function loginStaff(email: string, password: string) {
  const client = commerceDatabase();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session)
    throw new RequestError("Email ou palavra-passe inválidos.", 401);
  const jar = await cookies();
  jar.set(cookieName(), data.session.access_token, {
    httpOnly: true,
    secure: !!process.env.VERCEL || process.env.NODE_ENV !== "development",
    sameSite: "strict",
    path: "/",
    maxAge: data.session.expires_in,
  });
  // Reauthentication is intentional until a tested refresh-token rotation flow ships.
  return { id: data.user.id };
}
export async function staffSession(admin = false) {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token) throw new RequestError("Inicia sessão para continuar.", 401);
  const { data, error } = await commerceDatabase().auth.getUser(token);
  if (error || !data.user)
    throw new RequestError("A sessão terminou. Inicia sessão novamente.", 401);
  if (admin && data.user.app_metadata?.role !== "operations_admin")
    throw new RequestError("Acesso não autorizado.", 403);
  const environment = commerceEnvironment();
  const url =
    environment === "sandbox"
      ? sandboxDatabaseConfig().url
      : requireSecret("SUPABASE_URL");
  const key =
    environment === "sandbox"
      ? requireSecret("RUVON_SANDBOX_PUBLISHABLE_KEY")
      : requireSecret("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetchWithTimeout(input, init, 5000),
    },
  });
  return { user: data.user, client };
}
export async function logoutStaff() {
  (await cookies()).delete(cookieName());
}
