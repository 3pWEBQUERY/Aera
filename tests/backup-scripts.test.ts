import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function run(script: string, args: string[], env: Record<string, string>) {
  return spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("database backup safety rails", () => {
  it("refuses to run without an explicit database URL", () => {
    const result = run("backup-database.mjs", [], { DATABASE_URL: "" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DATABASE_URL fehlt");
  });

  it("never restores into the configured source database", () => {
    const url = "postgresql://user:secret@localhost:5432/aera_restore_test";
    const result = run(
      "restore-drill.mjs",
      ["--backup", "/tmp/does-not-exist.dump"],
      {
        DATABASE_URL: url,
        RESTORE_DATABASE_URL: url,
        RESTORE_DRILL_CONFIRM: "aera_restore_test",
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dieselbe Datenbank");
    expect(result.stderr).not.toContain("user:secret");
  });

  it("requires an unmistakably isolated restore database name", () => {
    const result = run(
      "restore-drill.mjs",
      ["--backup", "/tmp/does-not-exist.dump"],
      {
        DATABASE_URL: "postgresql://user:secret@localhost:5432/aera_live",
        RESTORE_DATABASE_URL: "postgresql://user:other@localhost:5432/aera_shadow",
        RESTORE_DRILL_CONFIRM: "aera_shadow",
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("restore, drill, test oder ci");
    expect(result.stderr).not.toContain("user:other");
  });
});
