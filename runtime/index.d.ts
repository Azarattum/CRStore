export function load(
  file: string,
  paths: {
    extension?: string;
    binding?: string;
    wasm?: string;
  },
): Promise<{
  database: any;
  env: "browser" | "node" | "bun";
}>;
