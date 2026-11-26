// Bettet alle Dateien aus public/ als Strings in src/assets.gen.js ein,
// damit der Worker sie ohne separaten Asset-Upload ausliefern kann.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, extname } from "node:path";

const root = new URL("../public/", import.meta.url).pathname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};
const BINARY = new Set([".jpg", ".png"]);

const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (types[extname(p)]) {
      const ext = extname(p);
      const key = "/" + relative(root, p).split("\\").join("/");
      files[key] = BINARY.has(ext)
        ? { type: types[ext], b64: readFileSync(p).toString("base64") }
        : { type: types[ext], body: readFileSync(p, "utf8") };
    }
  }
})(root);

writeFileSync(
  new URL("../src/assets.gen.js", import.meta.url),
  "// Automatisch erzeugt von scripts/build-assets.mjs – nicht bearbeiten.\nexport default " + JSON.stringify(files) + ";\n"
);
console.log(`assets.gen.js: ${Object.keys(files).length} Dateien`);
