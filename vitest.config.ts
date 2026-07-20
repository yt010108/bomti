import { defineConfig } from "vitest/config";
import { transformWithEsbuild } from "vite";

export default defineConfig({
  plugins: [{
    name: "bomti-test-tsx",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".tsx")) return null;
      return transformWithEsbuild(code, id, { loader: "tsx", jsx: "automatic" });
    }
  }],
  test: {
    include: ["tests/**/*.test.ts"],
    reporters: ["default"]
  }
});
