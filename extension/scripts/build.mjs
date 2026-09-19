import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await build({
  entryPoints: {
    background: fileURLToPath(new URL("../src/background.js", import.meta.url)),
    content: fileURLToPath(new URL("../src/content.js", import.meta.url)),
    "radar-bridge": fileURLToPath(new URL("../src/radar-bridge.js", import.meta.url)),
    options: fileURLToPath(new URL("../src/options.js", import.meta.url)),
    popup: fileURLToPath(new URL("../src/popup.js", import.meta.url))
  },
  bundle: true,
  format: "esm",
  outdir: fileURLToPath(new URL("../dist/", import.meta.url)),
  target: "chrome120",
  sourcemap: false,
  minify: false,
  logLevel: "info"
});
