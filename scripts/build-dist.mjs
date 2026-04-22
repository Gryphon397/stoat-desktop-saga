/**
 * Build script for electron-builder distribution.
 * Usage: node scripts/build-dist.mjs
 *
 * 1. Compiles src/main.ts  → .vite/build/main.js   (CJS, all node_modules externalized)
 * 2. Compiles src/preload.ts → .vite/build/preload.js (CJS, all node_modules externalized)
 *    - Custom plugin handles `?asset` imports (static: inline as base64; dynamic: glob+inline)
 * 3. Ensures keyspy's WinKeyServer.exe is present (downloads if missing)
 * 4. Runs electron-builder --win
 */

import { build } from "vite";
import { builtinModules } from "module";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// Externalize electron, all Node builtins, and all production dependencies.
// (electron-forge does this automatically; we replicate it here)
const external = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...Object.keys(pkg.dependencies ?? {}),
];

const MIME_MAP = {
  png: "image/png",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
};

function toDataUrl(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  const mime = MIME_MAP[ext] ?? `image/${ext}`;
  const data = readFileSync(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

/**
 * Handles forge-style `?asset` imports:
 *
 * Static:  `import x from "../../assets/foo.png?asset"`
 *           → inlined as a base64 data URL string at build time
 *
 * Dynamic: `await import(`.../${expr}.ico?asset`).then((m) => m.default)`
 *           → replaced with a lookup into an inlined map of all files in that dir
 */
function assetPlugin() {
  return {
    name: "asset-inline",

    resolveId(source, importer) {
      if (source.endsWith("?asset") && importer) {
        const rawPath = source.slice(0, -"?asset".length);
        return join(dirname(importer), rawPath) + "?asset";
      }
    },

    load(id) {
      if (id.endsWith("?asset")) {
        const filePath = id.slice(0, -"?asset".length);
        return `export default ${JSON.stringify(toDataUrl(filePath))};`;
      }
    },

    // Handle dynamic template-literal `?asset` imports (e.g. badge icons in badges.ts):
    //   await import(`...prefix/${expr}.ext?asset`).then((m) => m.default)
    // → await Promise.resolve(inlinedMap[String(expr)] ?? "")
    transform(code, id) {
      if (!code.includes("?asset")) return null;

      const pattern =
        /await\s+import\(\s*`([^`]*\/)\$\{([^}]+)\}(\.[a-z0-9]+)\?asset`\s*\)\s*\.then\s*\(\s*[^)]+\s*=>\s*[^.]+\.default\s*\)/gs;

      let changed = false;
      const newCode = code.replace(pattern, (_match, prefix, expr, dotExt) => {
        const assetDir = join(dirname(id), prefix);
        if (!existsSync(assetDir)) return _match;

        const ext = dotExt.slice(1);
        const mime = MIME_MAP[ext] ?? `image/${ext}`;
        const assetMap = {};
        for (const file of readdirSync(assetDir)) {
          if (file.endsWith(dotExt)) {
            const name = file.slice(0, -dotExt.length);
            const data = readFileSync(join(assetDir, file));
            assetMap[name] = `data:${mime};base64,${data.toString("base64")}`;
          }
        }

        changed = true;
        return `await Promise.resolve((${JSON.stringify(assetMap)})[String(${expr})] ?? "")`;
      });

      if (changed) return { code: newCode, map: null };
      return null;
    },
  };
}

// ─── 1. Compile main process ──────────────────────────────────────────────────
console.log("[build] Compiling main.ts...");
await build({
  root,
  configFile: false,
  logLevel: "warn",
  build: {
    outDir: join(root, ".vite/build"),
    emptyOutDir: true,
    lib: {
      entry: join(root, "src/main.ts"),
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    rollupOptions: {
      external,
      // 'auto' emits a runtime __esModule check so that pure-ESM packages
      // (electron-store, electron-serve, …) have their default import resolved
      // via .default rather than the raw module-namespace object.
      output: { interop: "auto" },
    },
  },
  plugins: [assetPlugin()],
});
console.log("[build] ✓ main.js");

// ─── 2. Compile preload ───────────────────────────────────────────────────────
console.log("[build] Compiling preload.ts...");
await build({
  root,
  configFile: false,
  logLevel: "warn",
  build: {
    outDir: join(root, ".vite/build"),
    emptyOutDir: false,
    lib: {
      entry: join(root, "src/preload.ts"),
      formats: ["cjs"],
      fileName: () => "preload.js",
    },
    rollupOptions: {
      external,
      output: { interop: "auto" },
    },
  },
  plugins: [assetPlugin()],
});
console.log("[build] ✓ preload.js");

// ─── 3. Ensure WinKeyServer.exe is present ────────────────────────────────────
if (process.platform === "win32") {
  const keyspyDir = join(root, "node_modules", "keyspy");
  const candidates = [
    join(keyspyDir, "build", "WinKeyServer.exe"),
    join(keyspyDir, "runtime", "WinKeyServer.exe"),
  ];
  const found = candidates.find(existsSync);
  if (!found) {
    await ensureWinKeyServer(keyspyDir);
  } else {
    console.log("[build] ✓ WinKeyServer.exe:", found);
  }
}

async function ensureWinKeyServer(keyspyDir) {
  const { mkdirSync, createWriteStream, unlinkSync } = await import("fs");
  const https = await import("https");
  const { execFileSync } = await import("child_process");

  const keyspyPkg = JSON.parse(
    readFileSync(join(keyspyDir, "package.json"), "utf8"),
  );
  const version = keyspyPkg.version;
  const runtimeDir = join(keyspyDir, "runtime");
  const exeDest = join(runtimeDir, "WinKeyServer.exe");
  const archiveName = "keyspy-win32-x64.tar.gz";
  const archiveDest = join(runtimeDir, archiveName);
  const downloadUrl = `https://github.com/teomyth/keyspy/releases/download/v${version}/${archiveName}`;

  mkdirSync(runtimeDir, { recursive: true });

  console.log("[build] Downloading WinKeyServer.exe from keyspy releases...");

  // Download the archive
  await new Promise((resolve, reject) => {
    function get(url) {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        const file = createWriteStream(archiveDest);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      }).on("error", reject);
    }
    get(downloadUrl);
  });

  // Extract using Windows built-in tar (avoids MSYS2 path issues)
  const winTar = "C:\\Windows\\System32\\tar.exe";
  try {
    execFileSync(winTar, ["-xzf", archiveDest, "-C", runtimeDir], {
      stdio: "inherit",
    });
    unlinkSync(archiveDest);
    console.log("[build] ✓ WinKeyServer.exe downloaded and extracted.");
  } catch (err) {
    console.warn(
      "[build] ⚠ WinKeyServer.exe extraction failed — push-to-talk may not work.",
      err.message,
    );
  }
}

// ─── 4. Run electron-builder ──────────────────────────────────────────────────
// Pass --publish to this script (or set GH_TOKEN) to publish to GitHub Releases.
const shouldPublish = process.argv.includes("--publish") || !!process.env.GH_TOKEN;
const publishFlag = shouldPublish ? "--publish always" : "--publish never";

// electron-builder detects pnpm from package.json "packageManager" field and
// calls `pnpm` to collect node modules. Ensure pnpm is resolvable in PATH.
const builderEnv = ensurePnpmInPath({ ...process.env });

function ensurePnpmInPath(env) {
  if (process.platform !== "win32") return env;
  // Quick check: is pnpm already on PATH?
  const check = spawnSync("pnpm", ["--version"], { shell: true });
  if (check.status === 0) return env;

  // pnpm installed by corepack ends up in %LOCALAPPDATA%\pnpm\.tools\pnpm\<ver>_*\bin\
  const base = join(
    process.env.LOCALAPPDATA ?? "C:\\Users\\Default\\AppData\\Local",
    "pnpm",
    ".tools",
    "pnpm",
  );
  if (!existsSync(base)) return env;

  for (const ver of readdirSync(base)) {
    const binDir = join(base, ver, "bin");
    if (existsSync(join(binDir, "pnpm.CMD"))) {
      console.log("[build] Adding pnpm to PATH:", binDir);
      env.PATH = binDir + ";" + (env.PATH ?? "");
      return env;
    }
  }
  return env;
}

console.log(`[build] Packaging with electron-builder (${shouldPublish ? "publishing to GitHub" : "local only"})...`);
const builderResult = spawnSync(
  join(root, "node_modules", ".bin", "electron-builder"),
  ["--win", ...publishFlag.split(" ")],
  { stdio: "inherit", cwd: root, shell: true, env: builderEnv },
);
if (builderResult.status !== 0) {
  console.error("[build] electron-builder failed");
  process.exit(builderResult.status ?? 1);
}
console.log("[build] ✓ Done! Installer written to release/");
