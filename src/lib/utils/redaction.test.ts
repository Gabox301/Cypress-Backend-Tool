import type { ApiRequest } from "$lib/types";
import { describe, expect, it } from "vite-plus/test";
import { isSensitiveKey, redactApiRequest, redactValue } from "./redaction";

const SETTINGS = {
  hideCredentials: true,
  hideCredentialsOptions: { headers: true, auth: true, body: true, query: true },
};

describe("isSensitiveKey (AUDIT-T2)", () => {
  it("matches credential-like keys across casings and separators", () => {
    for (const key of [
      "password",
      "userPassword",
      "passwd",
      "authToken",
      "api_key",
      "X-API-Key",
      "Cookie",
      "clientSecret",
      "access_token",
      "key",
      "jwt",
      "oauth",
      "keys",
      "passphrase",
      "authentication",
      "sessionId",
      "APIToken",
      "JWTToken",
      "IDToken",
      "userIDToken",
      "token2",
      "accesskey",
      "accessKey",
    ]) {
      expect(isSensitiveKey(key), `expected sensitive: ${key}`).toBe(true);
    }
  });

  it("does not confuse author with auth and leaves identifiers visible", () => {
    for (const key of ["author", "title", "username", "email", "id", "name"]) {
      expect(isSensitiveKey(key), `expected visible: ${key}`).toBe(false);
    }
  });
});

describe("redactValue — field-aware (AUDIT-T2)", () => {
  it("preserves non-sensitive primitives with their types", () => {
    expect(
      redactValue({ title: "Test Post", count: 3, ok: true, ratio: 1.5, missing: null }),
    ).toEqual({ title: "Test Post", count: 3, ok: true, ratio: 1.5, missing: null });
  });

  it("masks sensitive keys including nested and cased variants", () => {
    expect(
      redactValue({ user: { password: "x", name: "Ada" }, authToken: "y", author: "Bob" }),
    ).toEqual({ user: { password: "***", name: "Ada" }, authToken: "***", author: "Bob" });
  });

  it("keeps masking unkeyed scalars and bind-value arrays", () => {
    expect(redactValue("bare-secret")).toBe("***");
    expect(redactValue(["pw", 42])).toEqual(["***", "***"]);
  });

  it("masks secret columns in row arrays while preserving the rest", () => {
    expect(redactValue([{ id: 1, token: "s" }])).toEqual([{ id: 1, token: "***" }]);
  });

  it("masks realistic credential keys while preserving the rest (R1/R2/R3)", () => {
    expect(redactValue({ jwt: "t", oauthToken: "o", sessionId: "s", count: 1 })).toEqual({
      jwt: "***",
      oauthToken: "***",
      sessionId: "***",
      count: 1,
    });
  });

  it("handles circular structures without throwing", () => {
    const obj: Record<string, unknown> = { name: "Ada" };
    obj.self = obj;
    expect(() => redactValue(obj)).not.toThrow();
    expect(redactValue(obj)).toEqual({ name: "Ada", self: "***" });
  });
});

describe("redactApiRequest — per-request override (AUDIT-T2)", () => {
  it("returns the request unmasked and strips the flag when redact is false", () => {
    const req = {
      url: "https://x.test",
      method: "GET",
      body: { password: "p" },
      redact: false,
    } as unknown as ApiRequest;
    const out = redactApiRequest(req, SETTINGS);
    expect(out.body).toEqual({ password: "p" });
    expect(out).not.toHaveProperty("redact");
  });

  it("still masks sensitive body fields by default", () => {
    const out = redactApiRequest(
      { url: "https://x.test", method: "GET", body: { password: "p", title: "t" } } as ApiRequest,
      SETTINGS,
    );
    expect(out.body).toEqual({ password: "***", title: "t" });
  });

  it("keeps masking headers, auth and query as a whole", () => {
    const out = redactApiRequest(
      {
        url: "https://x.test",
        method: "GET",
        headers: { "Content-Type": "application/json" },
        qs: { name: "visible-by-name" },
        auth: { username: "admin", password: "pw" },
      } as unknown as ApiRequest,
      SETTINGS,
    );
    expect(out.headers).toEqual({ "Content-Type": "***" });
    expect(out.qs).toEqual({ name: "***" });
    expect(out.auth).toEqual({ username: "***", password: "***" });
  });
});
