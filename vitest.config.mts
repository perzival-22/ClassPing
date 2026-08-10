import { defineConfig } from "vitest/config";

/**
 * Unit tests cover the pure logic only — GPA maths, the iCalendar writer,
 * timezone derivation, streaks and link signing. Those are the places where a
 * regression is silent and expensive: a wrong grade or a 3am notification
 * destroys trust in a way a visible crash doesn't.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
