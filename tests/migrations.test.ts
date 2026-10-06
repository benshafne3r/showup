import { describe, expect, it } from "vitest";
import { missingMigrations } from "@/lib/migrations";

const FILES = ["0001_schema.sql", "0007_connect_payouts.sql", "0012_management.sql", "README.md"];

describe("missingMigrations", () => {
  it("matches CLI-style records (version prefix + bare name)", () => {
    expect(
      missingMigrations(FILES, [
        { version: "0001", name: "schema" },
        { version: "0007", name: "connect_payouts" },
        { version: "0012", name: "management" },
      ]),
    ).toEqual([]);
  });

  it("matches MCP-style records (timestamp version + full file name)", () => {
    expect(
      missingMigrations(FILES, [
        { version: "0001", name: "0001_schema" },
        { version: "20261006192057", name: "0007_connect_payouts" },
        { version: "20261006195413", name: "0012_management" },
      ]),
    ).toEqual([]);
  });

  it("reports files the database never recorded", () => {
    expect(missingMigrations(FILES, [{ version: "0001", name: "0001_schema" }])).toEqual([
      "0007_connect_payouts",
      "0012_management",
    ]);
  });
});
