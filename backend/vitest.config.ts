import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"], testTimeout: 60000, hookTimeout: 60000, fileParallelism: false,
    env: { LOGIN_RATE_LIMIT: "100000", MERCADOPAGO_ACCESS_TOKEN: "test-token", MERCADOPAGO_WEBHOOK_SECRET: "whsec" },
  },
});
