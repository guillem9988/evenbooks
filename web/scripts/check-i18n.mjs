// Fails when code calls t("section.key") with a key missing from a dictionary: t() also accepts
// plain strings, so TypeScript cannot catch it, and the raw key would show up in the UI.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locales = ["ca", "es", "en"];
const dicts = {};
for (const locale of locales) {
  dicts[locale] = (await import(join(root, "src/i18n", `${locale}.ts`)))[locale];
}

const lookup = (dict, key) => key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), dict);

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(name)) files.push(path);
  }
};
walk(join(root, "src"));

const missing = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bt\(\s*"([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)"/g)) {
    for (const locale of locales) {
      if (typeof lookup(dicts[locale], match[1]) !== "string") missing.push(`${relative(root, file)}: "${match[1]}" missing in ${locale}`);
    }
  }
}

if (missing.length > 0) {
  console.error(missing.join("\n"));
  process.exit(1);
}
console.log(`i18n: all keys used in ${files.length} files exist in ${locales.join(", ")}`);
