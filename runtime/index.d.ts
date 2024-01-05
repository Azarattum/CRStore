export function load(
  file: string,
  paths: {
    binding?: string;
    extension?: string;
    wasm?: string;
  },
): Promise<{
  database: any;
  browser: boolean;
}>;
