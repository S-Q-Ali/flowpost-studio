import { describe, it, expect } from "vitest";
import { readR2Config, R2_SECRET_NAMES } from "./r2.ts";
import { SecretProblem } from "./secrets.ts";

/** The stored rows, as the function reads them from `public.operator_config`. */
function fakeStored(rows: unknown) {
  const reads: { names: string[] }[] = [];
  const query = {
    select: () => query,
    in: (_column: string, names: string[]) => {
      reads.push({ names });
      return query;
    },
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return { client: { from: () => query }, reads };
}

/** The values stand for ciphertext; the test hands in what unsealing gives back. */
const identity = async (stored: string) => stored;

const storedBucket = [
  { name: "R2_ENDPOINT", value: "https://stored.r2.example" },
  { name: "R2_ACCESS_KEY", value: "stored-access" },
  { name: "R2_SECRET_KEY", value: "stored-secret" },
  { name: "R2_BUCKET", value: "stored-bucket" },
  { name: "R2_PUBLIC_URL", value: "stored-cdn.example" },
];

const envBucket = {
  R2_ENDPOINT: "https://env.r2.example",
  R2_ACCESS_KEY: "env-access",
  R2_SECRET_KEY: "env-secret",
  R2_BUCKET: "env-bucket",
  R2_PUBLIC_URL: "env-cdn.example",
};

describe("readR2Config", () => {
  it("takes the wizard-stored bucket over the environment", async () => {
    const { client } = fakeStored(storedBucket);
    const config = await readR2Config(client, {
      unseal: identity,
      env: (name) => envBucket[name as keyof typeof envBucket],
    });
    expect(config).toEqual({
      endpoint: "https://stored.r2.example",
      accessKey: "stored-access",
      secretKey: "stored-secret",
      bucket: "stored-bucket",
      publicUrl: "stored-cdn.example",
    });
  });

  it("falls back to the environment when nothing is stored", async () => {
    const { client } = fakeStored([]);
    const config = await readR2Config(client, {
      unseal: identity,
      env: (name) => envBucket[name as keyof typeof envBucket],
    });
    expect(config).toEqual({
      endpoint: "https://env.r2.example",
      accessKey: "env-access",
      secretKey: "env-secret",
      bucket: "env-bucket",
      publicUrl: "env-cdn.example",
    });
  });

  it("asks for exactly the five R2 names", async () => {
    const { client, reads } = fakeStored([]);
    await readR2Config(client, {
      unseal: identity,
      env: (name) => envBucket[name as keyof typeof envBucket],
    });
    expect(reads).toEqual([{ names: [...R2_SECRET_NAMES] }]);
    expect(R2_SECRET_NAMES).toEqual([
      "R2_ENDPOINT",
      "R2_ACCESS_KEY",
      "R2_SECRET_KEY",
      "R2_BUCKET",
      "R2_PUBLIC_URL",
    ]);
  });

  it("names the missing value instead of returning a half bucket", async () => {
    const { client } = fakeStored(storedBucket.filter((r) => r.name !== "R2_PUBLIC_URL"));
    let caught: SecretProblem | null = null;
    try {
      await readR2Config(client, { unseal: identity, env: () => undefined });
    } catch (err) {
      caught = err as SecretProblem;
    }
    expect(caught).toBeInstanceOf(SecretProblem);
    expect(caught?.names).toEqual(["R2_PUBLIC_URL"]);
    expect(caught?.message).toContain("guided setup");
  });
});