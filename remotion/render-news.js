#!/usr/bin/env node
// render-news.js — Remotion render script for news compositions.
// Accepts --composition to select which news composition to render.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const params = {
  composition: 'NewsVerticalBackground',
  contentDirectory: 'main/preview',
  output: 'out/news-video.mp4',
  concurrency: 4,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  switch (arg) {
    case '--composition': params.composition = nextArg; i++; break;
    case '--content':     params.contentDirectory = nextArg; i++; break;
    case '--output':
    case '-o':            params.output = nextArg; i++; break;
    case '--concurrency': params.concurrency = parseInt(nextArg, 10); i++; break;
    case '--help':
    case '-h':
      console.log(`
Usage: node render-news.js [options]

Options:
  --composition <name>   Remotion composition ID (default: NewsVerticalBackground)
                         One of: NewsVerticalBackground, NewsVerticalNoBackground,
                                 NewsHorizontalBackground, NewsHorizontalNoBackground,
                                 NewsHorizontalBackgroundCNN
  --content <dir>        Content directory inside public/ (default: main/preview)
  --output, -o <path>    Output file path (default: out/news-video.mp4)
  --concurrency <n>      Render concurrency (default: 4)
  --help, -h             Show this help
`);
      process.exit(0);
  }
}

// Minimal props — calculateMetadata loads everything from the config + staged files.
const props = {
  contentDirectory: params.contentDirectory,
  introDurationInFrames: 150,
  imageDurationInFrames: 170,
  images: [],
  videos: [],
  videoDurations: [],
  captions: [],
  introProps: { image1: '', image2: '', heroImage: '' },
  sections: [],
};

const propsFile = path.join(os.tmpdir(), `remotion-n2v-props-${Date.now()}.json`);
fs.writeFileSync(propsFile, JSON.stringify(props, null, 2), 'utf-8');

const cmd = `npx remotion render ${params.composition} "${params.output}" --props="${propsFile}" --concurrency=${params.concurrency} --bundle-cache=false`;

console.log(`\n========== NEWS-TO-VIDEO RENDER ==========`);
console.log(`Composition    : ${params.composition}`);
console.log(`Content Dir    : ${params.contentDirectory}`);
console.log(`Output         : ${params.output}`);
console.log(`Concurrency    : ${params.concurrency}`);
console.log(`==========================================\n`);

try {
  execSync(cmd, { stdio: 'inherit' });
} catch (_) {
  process.exit(1);
} finally {
  try { fs.unlinkSync(propsFile); } catch (_) {}
}
