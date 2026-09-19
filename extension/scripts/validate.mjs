import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Le manifeste doit rester en version 3");
if (manifest.content_scripts?.[0]?.matches?.length !== 5) throw new Error("Les cinq portails prioritaires doivent être déclarés");
if (!manifest.content_scripts?.some((entry) => entry.matches?.includes("https://radar-immo-blond.vercel.app/*"))) throw new Error("Le pont local Radar Immo doit être déclaré");
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...manifest.content_scripts.flatMap((entry) => entry.js || []),
  "dist/options.js",
  "dist/popup.js",
  "ui.css"
];
await Promise.all([...new Set(referenced)].map((path) => access(new URL(path, root))));
console.log(`Extension valide : ${manifest.name} ${manifest.version}, ${manifest.content_scripts[0].matches.length} sources et pont Radar Immo.`);
