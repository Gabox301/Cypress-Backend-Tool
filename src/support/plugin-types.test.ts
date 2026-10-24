import type { ApiRequestOptions as LibOptions } from "$lib/types";
import { describe, expectTypeOf, it } from "vite-plus/test";
import type { ApiRequestOptions as SupportOptions, DbConnectionOptions } from "./plugin-types";

describe("plugin-types — single source (PH3-T1)", () => {
  it("ApiRequestOptions es la misma declaración en ambas superficies", () => {
    expectTypeOf<LibOptions>().toEqualTypeOf<SupportOptions>();
    expectTypeOf<SupportOptions>().toEqualTypeOf<LibOptions>();
  });

  it("DbConnectionOptions acepta parciales (resolución por snapshot/fallbacks)", () => {
    const partial: DbConnectionOptions = { host: "override.example.test" };
    expectTypeOf(partial.host).toEqualTypeOf<string | undefined>();
    expectTypeOf(partial.port).toEqualTypeOf<number | undefined>();
  });
});
