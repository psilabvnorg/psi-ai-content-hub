import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In production (bundled CJS), __dirname points to the dist folder
  // The public folder should be at dist/public (sibling to index.cjs)
  const possiblePaths = [
    // Primary: relative to the bundled file location
    path.resolve(__dirname, "public"),
    // Fallback: relative to current working directory
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "dist", "public"),
  ];
  
  let distPath: string | null = null;
  
  for (const p of possiblePaths) {
    console.log(`[static] Checking path: ${p}`);
    if (fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))) {
      distPath = p;
      console.log(`[static] Found public files at: ${distPath}`);
      break;
    }
  }
  
  if (!distPath) {
    console.error(`[static] Could not find public directory. Checked:`);
    possiblePaths.forEach(p => console.error(`  - ${p}`));
    console.error(`[static] __dirname = ${__dirname}`);
    console.error(`[static] process.cwd() = ${process.cwd()}`);
    throw new Error(
      `Could not find the build directory. Make sure to build the client first.`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath!, "index.html"));
  });
}
