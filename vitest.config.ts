import { defineConfig } from "vitest/config"
export default defineConfig({ test: { include: ["tests/{investments,reports}/**/*.test.ts"] } })
