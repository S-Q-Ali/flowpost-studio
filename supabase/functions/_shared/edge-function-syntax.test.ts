import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const FUNCTIONS_DIR = join(import.meta.dirname, "..");

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" ? [] : tsFiles(path);
    return entry.endsWith(".ts") && !entry.endsWith(".d.ts") ? [path] : [];
  });
}

const files = tsFiles(FUNCTIONS_DIR).filter((path) => !path.endsWith(".test.ts"));

describe("edge function sources parse", () => {
  it("covers every function entry point", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("has no grammar-level error in any file", () => {
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      noEmit: true,
      noResolve: true,
      types: [],
      lib: [],
    });
    const found: string[] = [];
    for (const file of files) {
      const source = program.getSourceFile(file);
      if (!source) {
        found.push(`${file} was never parsed`);
        continue;
      }
      // TS1xxx codes are the grammar errors that stop a module from loading;
      // Deno turns one into an opaque `BOOT_ERROR` 503 only after deployment.
      // Type errors are out of scope: this run does not load Deno's globals.
      const diagnostics = [
        ...program.getSyntacticDiagnostics(source),
        ...program.getSemanticDiagnostics(source),
      ].filter((d) => d.code >= 1000 && d.code < 2000);
      for (const d of diagnostics) {
        const { line } = source.getLineAndCharacterOfPosition(d.start ?? 0);
        found.push(`${file.slice(FUNCTIONS_DIR.length + 1)}:${line + 1} TS${d.code}`);
      }
    }
    expect(found).toEqual([]);
    // Parsing every function with the TypeScript program takes a few seconds,
    // and more once the suite runs its files in parallel — the default 5s
    // timeout made this fail on load, not on a grammar error.
  }, 30_000);
});
