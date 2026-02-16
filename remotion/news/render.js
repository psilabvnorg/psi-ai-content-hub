#!/usr/bin/env node
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const params = {
  contentDirectory: 'main/video_1',
  introDurationInFrames: 150,
  imageDurationInFrames: 90,
  tagline: 'KÊNH KINH TẾ - CHÍNH TRỊ - XÃ HỘI',
  title: 'Loạt cổ phiếu ngân hàng, chứng khoán tăng trần',
  brandName: 'PSI.VN',
  template: 'template_1',
  output: 'out/video.mp4',
  concurrency: 8,
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  
  switch (arg) {
    case '--tagline':
      params.tagline = nextArg;
      i++;
      break;
    case '--title':
      params.title = nextArg;
      i++;
      break;
    case '--brand':
      params.brandName = nextArg;
      i++;
      break;
    case '--content':
      params.contentDirectory = nextArg;
      i++;
      break;
    case '--template':
      params.template = nextArg;
      i++;
      break;
    case '--intro':
      if (nextArg === 'none') {
        params.introDurationInFrames = 0;
      } else {
        // Convert seconds to frames (30 fps)
        params.introDurationInFrames = parseFloat(nextArg) * 30;
      }
      i++;
      break;
    case '--image-duration':
      params.imageDurationInFrames = parseInt(nextArg);
      i++;
      break;
    case '--output':
    case '-o':
      params.output = nextArg;
      i++;
      break;
    case '--concurrency':
      params.concurrency = parseInt(nextArg);
      i++;
      break;
    case '--help':
    case '-h':
      console.log(`
Usage: node render.js [options]

Options:
  --tagline <text>       Set tagline text (default: "KÊNH KINH TẾ - CHÍNH TRỊ - XÃ HỘI")
  --title <text>         Set title text
  --brand <text>         Set brand name (default: "PSI.VN")
  --content <dir>        Content directory (default: "main/video_1")
  --template <id>        Template ID (default: "template_1")
  --intro <secs|none>    Intro duration in seconds, or "none" for background mode (default: 5)
  --image-duration <n>   Duration per image in frames (default: 90)
  --output, -o <path>    Output file path (default: "out/video.mp4")
  --concurrency <n>      Render concurrency (default: 16)
  --help, -h             Show this help

Examples:
  node render.js --tagline "MY CUSTOM TAGLINE" --intro none
  node render.js --title "Breaking News" --output out/news.mp4
  node render.js --content main/video_2 --template template_2 --concurrency 24
`);
      process.exit(0);
  }
}

// Build props object
const props = {
  contentDirectory: params.contentDirectory,
  introDurationInFrames: params.introDurationInFrames,
  imageDurationInFrames: params.imageDurationInFrames,
  // Explicitly set empty arrays so calculateMetadata will load from contentDirectory
  images: [],
  videos: [],
  videoDurations: [],
  captions: [],  // IMPORTANT: Empty array forces loading from contentDirectory/audio/*.json
  introProps: {
    templateId: params.template,
    tagline: params.tagline,
    title: params.title,
    brandName: params.brandName,
    url: 'https://psi.vn',
    backgroundImage: `main/${params.contentDirectory.split('/')[1] || 'video_1'}/Intro.jpg`,
    gradientTopColor: 'rgba(10, 10, 26, 0.7)',
    gradientBottomColor: 'rgba(0, 0, 0, 0.85)',
    gradientOpacity: 1,
    showBackgroundPattern: true,
    backgroundPatternOpacity: 0.7,
    showTopLogo: true,
    topLogoX: 960,
    topLogoY: 30,
    topLogoSize: 80,
    showBrandLogo: true,
    brandSectionX: 80,
    brandSectionY: 1080,
    brandLogoSize: 100,
    brandNameSize: 120,
    brandNameColor: '#ffffff',
    accentColor: '#ffffff',
    taglineX: 80,
    taglineY: 1230,
    taglineSize: 28,
    taglineColor: '#ffffff',
    titleX: 80,
    titleY: 1390,
    titleSize: 64,
    titleColor: '#ffffff',
    showSocialIcons: true,
    socialSectionX: 40,
    socialSectionY: 1830,
    socialIconSize: 45,
    showFacebook: true,
    showTikTok: true,
    showYouTube: true,
    showInstagram: true,
    urlX: 0,
    urlSize: 32,
    urlColor: '#ffffff',
    showMoneyElement: true,
    moneyElementX: 140,
    moneyElementY: 1260,
    moneyElementSize: 400,
    moneyElementOpacity: 0.1,
    showProfitElement: true,
    profitElementX: 410,
    profitElementY: 1430,
    profitElementSize: 710,
    profitElementOpacity: 0.2,
    enableAudio: false,
    audioVolume: 0.3,
    animationSpeed: 1,
  },
};

// Build and run command
const propsJson = JSON.stringify(props).replace(/'/g, "'\\''");
const cmd = `npx remotion render MainVideo "${params.output}" --props='${propsJson}' --concurrency=${params.concurrency} --bundle-cache=false`;

// Derive expected caption JSON path from content directory
const contentDir = params.contentDirectory;
const expectedCaptionDir = `public/${contentDir}/audio/`;

console.log(`\n========== RENDER CONFIGURATION ==========`);
console.log(`Content Directory: ${contentDir}`);
console.log(`Caption JSON Location: ${expectedCaptionDir}*.json`);
console.log(`  (JSON file should match audio filename, e.g., audio.mp3 -> audio.json)`);
console.log(`Tagline: "${params.tagline}"`);
console.log(`Output: ${params.output}`);
console.log(`Mode: ${params.introDurationInFrames === 0 ? 'Background' : 'Normal'}`);
console.log(`==========================================\n`);

try {
  execSync(cmd, { stdio: 'inherit' });
} catch (error) {
  process.exit(1);
}
