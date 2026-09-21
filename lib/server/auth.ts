import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
export const ADMIN_COOKIE = "jola_admin";
export const SESSION_SECONDS = 8 * 60 * 60;
export function adminConfigured() {
  return (process.env.ADMIN_PASSWORD?.length ?? 0) >= 12;
}
function signature(value: string) {
  return createHmac("sha256", process.env.ADMIN_PASSWORD!)
    .update(value)
    .digest("hex");
}
export function passwordMatches(password: string) {
  if (!adminConfigured()) return false;
  return timingSafeEqual(
    Buffer.from(signature(password)),
    Buffer.from(signature(process.env.ADMIN_PASSWORD!)),
  );
}
export function createAdminToken() {
  const exp = String(Date.now() + SESSION_SECONDS * 1000);
  return `${exp}.${signature(exp)}`;
}
export async function isAdmin() {
  if (!adminConfigured()) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const [exp, sig, ...extra] = token.split(".");
  if (
    extra.length ||
    !/^\d+$/.test(exp) ||
    !sig ||
    sig.length !== 64 ||
    !/^[a-f0-9]+$/.test(sig) ||
    Number(exp) < Date.now() ||
    Number(exp) > Date.now() + SESSION_SECONDS * 1000
  )
    return false;
  return timingSafeEqual(Buffer.from(signature(exp)), Buffer.from(sig));
}
