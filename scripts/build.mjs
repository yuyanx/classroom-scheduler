import { build } from "esbuild";

const vercelEnv = process.env.VERCEL_ENV ?? "";

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