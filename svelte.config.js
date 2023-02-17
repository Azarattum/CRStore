import { vitePreprocess } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    files: {
      routes: "src/demo",
      appTemplate: "src/demo/app.html",
    },
    alias:
      process.env.NODE_ENV === "development"
        ? {
            "crstore/runtime": "./runtime/browser.js",
          }
        : {},
  },
};

export default config;
