import { defineConfig } from "vite";

// Base is set for GitHub Pages project-site hosting (https://<user>.github.io/syntax-diagram-generator/).
// Override with BASE_PATH env var if the repo name differs.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/syntax-diagram-generator/",
  test: {
    globals: true,
    environment: "node",
  },
});
