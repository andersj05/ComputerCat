import type { OAuthAuth } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAuth, isCodexSignInUrl } from "../../src/agent/codex-auth";

const credential = {
  type: "oauth" as const,
  access: "test-access-secret",
  refresh: "test-refresh-secret",
  expires: Date.now() + 3_600_000,
  accountId: "test-account",
};
const instances: CodexAuth[] = [];
afterEach(() => {
  for (const auth of instances.splice(0)) auth.dispose();
  vi.unstubAllGlobals();
});

function setup(initial?: string, overrides: Partial<OAuthAuth> = {}) {
  let saved = initial;
  const storage = {
    available: vi.fn(() => true),
    read: vi.fn(async () => saved),
    write: vi.fn(async (value: string | undefined) => {
      saved = value;
    }),
  };
  const oauth: OAuthAuth = {
    name: "Test subscription",
    login: vi.fn(async () => credential),
    refresh: vi.fn(async () => credential),
    toAuth: vi.fn(async (value) => ({ apiKey: value.access })),
    ...overrides,
  };
  const open = vi.fn(async (_url: string) => {});
  const changed = vi.fn();
  const auth = new CodexAuth(storage, open, changed, { ...openaiCodexProvider(), auth: { oauth } });
  instances.push(auth);
  return { auth, storage, oauth, open, changed, saved: () => saved };
}

describe("Codex OAuth connection", () => {
  it("lists GPT-6 Luna Medium using the same catalog as the worker", () => {
    const auth = new CodexAuth(
      { available: () => true, read: async () => undefined, write: async () => {} },
      async () => {},
      () => {},
    );
    instances.push(auth);
    expect(auth.catalog()).toContainEqual({
      id: "gpt-6-luna",
      name: "GPT-6 Luna",
      reasoning: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
    });
  });

  it("persists login, exposes only status, restores it, and removes it on disconnect", async () => {
    const { auth, storage, saved } = setup();
    await auth.load();
    expect(auth.start("browser")).toEqual({ ok: true });
    await vi.waitFor(() => expect(auth.snapshot().connected).toBe(true));
    expect(JSON.stringify(auth.snapshot())).not.toContain("secret");
    expect(
      auth
        .catalog()
        .some((model) => model.id === "gpt-5.6-sol" && model.reasoning.includes("medium")),
    ).toBe(true);
    const restored = setup(saved()).auth;
    await restored.load();
    expect(await restored.accessToken(new AbortController().signal)).toBe(credential.access);
    expect(await auth.disconnect()).toEqual({ ok: true });
    expect(storage.write).toHaveBeenLastCalledWith(undefined);
    expect(auth.snapshot().connected).toBe(false);
    await expect(auth.accessToken(new AbortController().signal)).rejects.toThrow("Options");
  });

  it("serializes refresh and persists rotated credentials before returning access", async () => {
    const { auth, oauth, saved } = setup(JSON.stringify({ ...credential, expires: 1 }));
    await auth.load();
    const signal = new AbortController().signal;
    expect(await Promise.all([auth.accessToken(signal), auth.accessToken(signal)])).toEqual([
      credential.access,
      credential.access,
    ]);
    expect(oauth.refresh).toHaveBeenCalledOnce();
    expect(JSON.parse(saved() ?? "null")).toEqual(credential);
  });

  it("never falls back to another credential after refresh failure and hides provider errors", async () => {
    const { auth, saved } = setup(JSON.stringify({ ...credential, expires: 1 }), {
      refresh: async () => {
        throw new Error("private-token-and-server-payload");
      },
    });
    await auth.load();
    await expect(auth.accessToken(new AbortController().signal)).rejects.toThrow("refresh");
    expect(JSON.stringify(auth.snapshot())).not.toContain("private-token");
    expect(saved()).toContain(credential.refresh);
  });

  it("keeps a rotated refresh token if Stop arrives during its persistence", async () => {
    const { auth, storage, saved, oauth } = setup(JSON.stringify({ ...credential, expires: 1 }));
    await auth.load();
    const abort = new AbortController();
    const persist = storage.write.getMockImplementation();
    storage.write.mockImplementationOnce(async (value) => {
      await persist?.(value);
      abort.abort();
    });
    await expect(auth.accessToken(abort.signal)).rejects.toThrow();
    await vi.waitFor(() => expect(saved()).toBe(JSON.stringify(credential)));
    expect(await auth.accessToken(new AbortController().signal)).toBe(credential.access);
    expect(oauth.refresh).toHaveBeenCalledOnce();
  });

  it("rejects insecure storage, corrupt credentials, and failed login persistence", async () => {
    const { auth, storage } = setup("corrupt");
    await auth.load();
    expect(auth.snapshot()).toMatchObject({
      connected: false,
      message: expect.stringContaining("Sign in again"),
    });
    storage.available.mockReturnValue(false);
    expect(auth.start("browser").ok).toBe(false);
    storage.available.mockReturnValue(true);
    storage.write.mockRejectedValue(new Error("private-path"));
    auth.start("browser");
    await vi.waitFor(() => expect(auth.snapshot().login).toBeNull());
    expect(auth.snapshot().connected).toBe(false);
    expect(JSON.stringify(auth.snapshot())).not.toContain("private-path");
  });

  it("cancels login and ignores a late provider success", async () => {
    let complete: ((value: typeof credential) => void) | undefined;
    const { auth, storage } = setup(undefined, {
      login: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    });
    auth.start("browser");
    expect(auth.start("browser").ok).toBe(false);
    await vi.waitFor(() => expect(complete).toBeDefined());
    const id = auth.snapshot().login?.attemptId ?? "";
    expect(auth.cancel("stale-id").ok).toBe(false);
    expect(auth.cancel(id)).toEqual({ ok: true });
    complete?.(credential);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(storage.write).not.toHaveBeenCalled();
    expect(auth.snapshot()).toMatchObject({ connected: false, login: null });
  });

  it("allows retry after browser launch failure and requires a callback from the current attempt", async () => {
    const { auth, open } = setup(undefined, {
      login: async (interaction) => {
        expect(
          await interaction.prompt({
            type: "select",
            message: "Method",
            options: [{ id: "browser", label: "Browser" }],
          }),
        ).toBe("browser");
        interaction.notify({
          type: "auth_url",
          url: "https://auth.openai.com/oauth/authorize?state=current",
        });
        await interaction.prompt({ type: "manual_code", message: "Callback" });
        return credential;
      },
    });
    open.mockRejectedValueOnce(new Error("OS details"));
    auth.start("browser");
    await vi.waitFor(() => expect(auth.snapshot().message).toContain("Couldn't open"));
    const id = auth.snapshot().login?.attemptId ?? "";
    expect(auth.submit(id, "raw-code").ok).toBe(false);
    expect(auth.submit(id, "http://localhost:1455/auth/callback?code=test&state=stale").ok).toBe(
      false,
    );
    expect(await auth.openSignIn(id)).toEqual({ ok: true });
    expect(auth.submit(id, "http://localhost:1455/auth/callback?code=test&state=current")).toEqual({
      ok: true,
    });
    await vi.waitFor(() => expect(auth.snapshot().connected).toBe(true));
    expect(auth.submit(id, "old-code").ok).toBe(false);
  });

  it("interrupts token refresh when the user disconnects and cannot restore old credentials", async () => {
    const { auth, saved } = setup(JSON.stringify({ ...credential, expires: 1 }), {
      refresh: (_value, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true });
        }),
    });
    await auth.load();
    const result = auth.accessToken(new AbortController().signal).catch(() => "cancelled");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await auth.disconnect()).toEqual({ ok: true });
    expect(await result).toBe("cancelled");
    expect(saved()).toBeUndefined();
  });

  it("uses the real SDK device flow with intercepted network responses", async () => {
    const token = `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } })).toString("base64")}.signature`;
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (url === "https://auth.openai.com/api/accounts/deviceauth/usercode")
        return Response.json({ device_auth_id: "device", user_code: "TEST-CODE", interval: "0" });
      if (url === "https://auth.openai.com/api/accounts/deviceauth/token")
        return Response.json({ authorization_code: "code", code_verifier: "verifier" });
      if (url === "https://auth.openai.com/oauth/token")
        return Response.json({
          access_token: token,
          refresh_token: "fake-refresh",
          expires_in: 3600,
        });
      throw new Error("Unexpected network request");
    });
    vi.stubGlobal("fetch", fetch);
    const { storage, open } = setup();
    const auth = new CodexAuth(storage, open, () => {});
    instances.push(auth);
    auth.start("device_code");
    await vi.waitFor(() => expect(auth.snapshot().connected).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(open).toHaveBeenCalledWith("https://auth.openai.com/codex/device");
    expect(await auth.accessToken(new AbortController().signal)).toBe(token);
  });
});

it("restricts browser launches to OpenAI's exact OAuth destinations", () => {
  expect(isCodexSignInUrl("https://auth.openai.com/oauth/authorize?state=x")).toBe(true);
  expect(isCodexSignInUrl("https://auth.openai.com/codex/device")).toBe(true);
  for (const url of [
    "file:///tmp/secret",
    "javascript:alert(1)",
    "https://auth.openai.com.evil.test/codex/device",
    "https://auth.openai.com/other",
    "https://user:pass@auth.openai.com/codex/device",
    "http://auth.openai.com/codex/device",
  ])
    expect(isCodexSignInUrl(url)).toBe(false);
});
