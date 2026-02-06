import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline, env } from '@xenova/transformers';

const APP_DATA = process.env.APPDATA || path.join(os.homedir(), '.config');
const TTS_ROOT = process.env.VIE_NEU_TTS_ROOT
  ? path.resolve(process.env.VIE_NEU_TTS_ROOT)
  : path.join(APP_DATA, 'psi-ai-content-hub', 'vie-neu-tts');
const MODEL_ID = process.env.TTS_MODEL_ID || 'Xenova/mms-tts-vie';
const CACHE_DIR = path.join(TTS_ROOT, 'models');
const MARKER_FILE = path.join(TTS_ROOT, 'tts_ready.json');

env.cacheDir = CACHE_DIR;
env.allowLocalModels = true;
env.allowRemoteModels = true;

function emitProgress(stage, message, percent = null) {
  const progressData = {
    type: 'progress',
    stage,
    message,
    percent,
    timestamp: new Date().toISOString(),
  };
  process.stderr.write('[TTS Runner] Progress: ' + JSON.stringify(progressData) + '\n');
  process.stderr.write(JSON.stringify(progressData) + '\n');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeWav(filePath, audio, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  const samples = new Int16Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

async function loadPipeline() {
  return pipeline('text-to-speech', MODEL_ID);
}

async function downloadModels() {
  ensureDir(TTS_ROOT);
  ensureDir(CACHE_DIR);
  emitProgress('initializing', 'Preparing to download models...', 0);
  emitProgress('downloading', 'Downloading TTS model...', 25);
  const tts = await loadPipeline();
  emitProgress('testing', 'Testing model...', 75);
  await tts('Xin chào');
  emitProgress('complete', 'Model setup complete', 100);
  fs.writeFileSync(
    MARKER_FILE,
    JSON.stringify({ modelId: MODEL_ID, downloadedAt: new Date().toISOString() }, null, 2)
  );
}

async function generateAudio(payload) {
  process.stderr.write('[TTS Runner] Starting audio generation\n');
  process.stderr.write('[TTS Runner] Text length: ' + (payload.text?.length || 0) + '\n');
  const text = (payload.text || '').trim();
  if (!text) {
    throw new Error('text is required');
  }
  if (!payload.output_path) {
    throw new Error('output_path is required');
  }

  ensureDir(TTS_ROOT);
  ensureDir(CACHE_DIR);

  emitProgress('initializing', 'Initializing TTS pipeline...', 10);
  const tts = await loadPipeline();
  process.stderr.write('[TTS Runner] Pipeline loaded\n');
  
  emitProgress('loading', 'Model loaded, processing text...', 30);
  const result = await tts(text);
  process.stderr.write('[TTS Runner] Text processed, audio generated\n');
  
  emitProgress('generating', 'Generating audio waveform...', 60);
  const audio = result.audio;
  const sampleRate = result.sampling_rate || 24000;
  process.stderr.write('[TTS Runner] Audio length: ' + audio.length + ' samples at ' + sampleRate + ' Hz\n');

  emitProgress('writing', 'Writing audio file...', 80);
  writeWav(payload.output_path, audio, sampleRate);
  process.stderr.write('[TTS Runner] Audio file written to: ' + payload.output_path + '\n');

  fs.writeFileSync(
    MARKER_FILE,
    JSON.stringify({ modelId: MODEL_ID, downloadedAt: new Date().toISOString() }, null, 2)
  );

  emitProgress('complete', 'Audio generation complete', 100);

  const resultData = {
    status: 'success',
    output_path: payload.output_path,
    duration: Math.round((audio.length / sampleRate) * 100) / 100,
    sample_rate: sampleRate,
    process_time: null,
    model_id: MODEL_ID,
  };
  process.stderr.write('[TTS Runner] Generation complete: ' + JSON.stringify(resultData) + '\n');
  return resultData;
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    downloadOnly: args.has('--download'),
  };
}

async function main() {
  const args = parseArgs();
  if (args.downloadOnly) {
    await downloadModels();
    process.stdout.write(JSON.stringify({ status: 'success' }));
    process.exit(0);
    return;
  }

  let payload = {};
  const input = await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk.toString()));
    process.stdin.on('end', () => resolve(data));
  });
  if (input) {
    payload = JSON.parse(input);
  }

  const result = await generateAudio(payload);
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(err.message || String(err));
  process.exit(1);
});
