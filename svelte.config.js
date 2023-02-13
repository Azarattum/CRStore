import adapter from "@sveltejs/adapter-static";
import preprocess from "svelte-preprocess";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: preprocess(),

  kit: {
    adapter: adapter(),
    files: {
      routes: "src/demo",
      appTemplate: "src/demo/app.html",
    },
  },
};

export default config;
