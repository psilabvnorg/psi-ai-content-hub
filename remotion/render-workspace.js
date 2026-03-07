#!/usr/bin/env node

const {execSync} = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const params = {
  composition: "NewsAnchorComposition",
  workspace: "preview-active-news-anchor",
  apiBase: "http://127.0.0.1:6901",
  output: "out/video.mp4",
  concurrency: 4,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  switch (arg) {
    case "--composition":
      params.composition = nextArg;
      i++;
      break;
    case "--workspace":
      params.workspace = nextArg;
      i++;
      break;
    case "--api-base":
      params.apiBase = nextArg;
      i++;
      break;
    case "--output":
    case "-o":
      params.output = nextArg;
      i++;
      break;
    case "--concurrency":
      params.concurrency = parseInt(nextArg, 10);
      i++;
      break;
    default:
      break;
  }
}

const propsFile = path.join(os.tmpdir(), `remotion-workspace-props-${Date.now()}.json`);
fs.writeFileSync(propsFile, JSON.stringify({
  workspaceId: params.workspace,
  apiBaseUrl: params.apiBase,
}, null, 2), "utf-8");

const cmd = `npx remotion render ${params.composition} "${params.output}" --props="${propsFile}" --concurrency=${params.concurrency} --bundle-cache=false`;

console.log(`\n========== REMOTION WORKSPACE RENDER ==========`);
console.log(`Composition    : ${params.composition}`);
console.log(`Workspace      : ${params.workspace}`);
console.log(`API Base       : ${params.apiBase}`);
console.log(`Output         : ${params.output}`);
console.log(`Concurrency    : ${params.concurrency}`);
console.log(`===============================================\n`);

try {
  execSync(cmd, {stdio: "inherit"});
} catch (_) {
  process.exit(1);
} finally {
  try {
    fs.unlinkSync(propsFile);
  } catch (_) {}
}
