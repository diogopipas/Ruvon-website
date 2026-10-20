import { beforeEach, expect, it, vi } from "vitest";
import { merchantRpc } from "@/lib/server/merchant/service";
import { RequestError } from "@/lib/server/http";

const { rpc, staff } = vi.hoisted(() => ({ rpc: vi.fn(), staff: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/merchant/auth", () => ({ staffSession: staff }));
beforeEach(() => {
  vi.resetAllMocks();
  staff.mockResolvedValue({ client: { rpc } });
});

it.each([
  ["42501", 403],
  ["40001", 409],
  ["23505", 409],
  ["P0001", 400],
  ["22023", 400],
  ["22P02", 400],
  ["P0002", 404],
])(
  "classifies rolled-back merchant rejection %s as HTTP %s without exposing database text",
  async (code, status) => {
    rpc.mockResolvedValue({
      error: { code, message: "PRIVATE_DATABASE_DETAIL" },
    });
    const error = await merchantRpc("merchant_command", {}).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RequestError);
    expect(error).toMatchObject({ status });
    expect((error as Error).message).not.toContain("PRIVATE_DATABASE_DETAIL");
  },
);

it.each(["57014", "08006"])(
  "does not classify database interruption %s as a definitive rejection",
  async (code) => {
    const failure = { code, message: "Interrupted" };
    rpc.mockResolvedValue({ error: failure });
    await expect(merchantRpc("merchant_command")).rejects.toBe(failure);
  },
);

it("requires the named session before dispatching a merchant command", async () => {
  staff.mockRejectedValue(new RequestError("Session expired", 401));
  await expect(merchantRpc("merchant_command")).rejects.toMatchObject({
    status: 401,
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("returns the database receipt through the named user's client", async () => {
  const receipt = { id: "order", version: 4 };
  const input = { p_command: "stable-command" };
  rpc.mockResolvedValue({ data: receipt, error: null });
  await expect(merchantRpc("merchant_command", input)).resolves.toBe(receipt);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("merchant_command", input);
});
