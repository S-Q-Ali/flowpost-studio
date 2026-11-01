import { describe, it, expect } from "vitest";
import { SecretProblem, readSecret, readSecrets, secretNotSetMessage } from "./secrets.ts";

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

function withEnv(values: Record<string, string | undefined>) {
  return { env: (name: string) => values[name] };
}

describe("readSecrets", () => {
  it("takes a stored value over the environment", async () => {
    const { client } = fakeStored([{ name: "GROQ_API_KEY", value: "stored-key" }]);
    const values = await readSecrets(client, ["GROQ_API_KEY"], {
      unseal: identity,
      ...withEnv({ GROQ_API_KEY: "env-key" }),
    });
    expect(values).toEqual({ GROQ_API_KEY: "stored-key" });
  });

  it("asks the database for exactly the names it was given", async () => {
    const { client, reads } = fakeStored([]);
    await readSecrets(client, ["R2_BUCKET", "R2_ENDPOINT"], {
      unseal: identity,
      ...withEnv({ R2_BUCKET: "bucket", R2_ENDPOINT: "https://rs.example" }),
    });
    expect(reads).toEqual([{ names: ["R2_BUCKET", "R2_ENDPOINT"] }]);
  });

  it("falls back to the environment when nothing is stored", async () => {
    const { client } = fakeStored([]);
    const values = await readSecrets(client, ["R2_ACCESS_KEY"], {
      unseal: identity,
      ...withEnv({ R2_ACCESS_KEY: " env-access-key " }),
    });
    expect(values).toEqual({ R2_ACCESS_KEY: "env-access-key" });
  });

  it("still answers from the environment when the read fails", async () => {
    const query = {
      select: () => query,
      in: () => query,
      then: (resolve: (result: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: "database is offline" } }).then(resolve),
    };
    const client = { from: () => query };
    const values = await readSecrets(client, ["GROQ_API_KEY"], {
      unseal: identity,
      ...withEnv({ GROQ_API_KEY: "env-key" }),
    });
    expect(values).toEqual({ GROQ_API_KEY: "env-key" });
  });

  it("names every value it could not find", async () => {
    const { client } = fakeStored([{ name: "R2_BUCKET", value: "bucket" }]);
    let caught: SecretProblem | null = null;
    try {
      await readSecrets(client, ["R2_BUCKET", "R2_ENDPOINT", "GROQ_API_KEY"], {
        unseal: identity,
      });
    } catch (err) {
      caught = err as SecretProblem;
    }
    expect(caught).toBeInstanceOf(SecretProblem);
    expect(caught?.names).toEqual(["R2_ENDPOINT", "GROQ_API_KEY"]);
    expect(caught?.message).toContain("R2_ENDPOINT, GROQ_API_KEY");
    expect(caught?.message).toContain("guided setup");
    // A missing value is told about by name, never by content.
    expect(caught?.message).not.toContain("bucket");
  });

  it("reports a stored value the server cannot read as its own problem", async () => {
    const { client } = fakeStored([{ name: "GROQ_API_KEY", value: "ciphertext-that-won-t-open" }]);
    let message = "";
    try {
      await readSecrets(client, ["GROQ_API_KEY"], {
        unseal: async () => {
          throw new Error("the stored bytes will not open");
        },
        ...withEnv({ GROQ_API_KEY: "env-key" }),
      });
    } catch (err) {
      message = (err as SecretProblem).message;
    }
    expect(message).toContain("cannot read");
    expect(message).toContain("TOKEN_ENCRYPTION_KEY");
    // Neither the stored blob nor the reason it failed is shown to a caller.
    expect(message).not.toContain("ciphertext-that-won-t-open");
    expect(message).not.toContain("will not open");
  });
});

describe("readSecret", () => {
  it("returns the one value it was asked for", async () => {
    const { client } = fakeStored([{ name: "GROQ_API_KEY", value: "stored-key" }]);
    const value = await readSecret(client, "GROQ_API_KEY", {
      unseal: identity,
      ...withEnv({ GROQ_API_KEY: "env-key" }),
    });
    expect(value).toBe("stored-key");
  });

  it("says where to set a value that has neither source", async () => {
    const { client } = fakeStored([]);
    await expect(readSecret(client, "GROQ_API_KEY", { unseal: identity })).rejects.toThrow(
      secretNotSetMessage(["GROQ_API_KEY"]),
    );
  });
});

describe("secretNotSetMessage", () => {
  it("names the value and both places it can come from", () => {
    const message = secretNotSetMessage(["R2_BUCKET"]);
    expect(message).toContain("R2_BUCKET");
    expect(message).toContain("guided setup");
    expect(message).toContain("Secrets");
  });
});
