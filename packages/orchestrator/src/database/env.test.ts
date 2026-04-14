import { describe, expect, it, vi } from "vitest";
import { loadRuntimeEnvFile } from "./env.js";

describe("loadRuntimeEnvFile", () => {
  it("does not call process.loadEnvFile in production", () => {
    const originalAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = "production";
    const loader = vi.fn();

    try {
      const result = loadRuntimeEnvFile(loader);
      expect(loader).not.toHaveBeenCalled();
      expect(result).toEqual({ appEnv: "production", loaded: false });
    } finally {
      if (originalAppEnv === undefined) {
        delete process.env.APP_ENV;
      } else {
        process.env.APP_ENV = originalAppEnv;
      }
    }
  });

  it("calls process.loadEnvFile outside production", () => {
    const originalAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = "development";
    const loader = vi.fn(() => {
      process.env.APP_ENV = "staging";
    });

    try {
      const result = loadRuntimeEnvFile(loader);
      expect(loader).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ appEnv: "staging", loaded: true });
    } finally {
      if (originalAppEnv === undefined) {
        delete process.env.APP_ENV;
      } else {
        process.env.APP_ENV = originalAppEnv;
      }
    }
  });
});
