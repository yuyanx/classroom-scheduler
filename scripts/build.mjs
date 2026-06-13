import { build } from "esbuild";

// Vercel sets this at deploy time; default production so committed app.js syncs on real hosts.
const vercelEnv = process.env.VERCEL_ENV ?? "production";

await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: true,
  outfile: "app.js",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.VERCEL_ENV": JSON.stringify(vercelEnv),
  },
  loader: {
    ".ts": "ts",
    ".jsx": "jsx",
  },
});