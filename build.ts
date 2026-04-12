
import { resolve } from "node:path";

const isProd = process.argv.includes("--prod");
const isWatch = process.argv.includes("--watch");

async function copyAssets() {
  const assets = ["manifest.json", "styles.css"];
  for (const asset of assets) {
    const src = resolve(asset);
    const dest = resolve(`dist/${asset}`);
    const file = Bun.file(src);
    if (await file.exists()) {
      await Bun.write(dest, file);
    }
  }
}

async function build() {
  await Bun.build({
    entrypoints: ["./src/main.ts"],
    outdir: "./dist",
    target: "browser",
    external: ["obsidian"],
    format: "cjs",
    sourcemap: isProd ? "none" : "inline",
    minify: isProd,
  });
  await copyAssets();
  console.log(`[${new Date().toLocaleTimeString()}] Build complete.`);
}

build();

if (isWatch) {
  console.log("Watching for changes...");
  import("fs").then(fs => {
    let buildTimeout: any = null;
    fs.watch(resolve("src"), { recursive: true }, async () => {
      if (buildTimeout) clearTimeout(buildTimeout);
      buildTimeout = setTimeout(async () => {
        console.log("Change detected, rebuilding...");
        await build();
      }, 100);
    });
  });
}
