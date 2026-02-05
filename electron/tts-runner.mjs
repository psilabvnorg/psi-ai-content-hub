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
  const tts = await loadPipeline();
  await tts('Xin chào');
  fs.writeFileSync(
    MARKER_FILE,
    JSON.stringify({ modelId: MODEL_ID, downloadedAt: new Date().toISOString() }, null, 2)
  );
}

async function generateAudio(payload) {
  const text = (payload.text || '').trim();
  if (!text) {
    throw new Error('text is required');
  }
  if (!payload.output_path) {
    throw new Error('output_path is required');
  }

  ensureDir(TTS_ROOT);
  ensureDir(CACHE_DIR);

  const tts = await loadPipeline();
  const result = await tts(text);
  const audio = result.audio;
  const sampleRate = result.sampling_rate || 24000;

  writeWav(payload.output_path, audio, sampleRate);

  fs.writeFileSync(
    MARKER_FILE,
    JSON.stringify({ modelId: MODEL_ID, downloadedAt: new Date().toISOString() }, null, 2)
  );

  return {
    status: 'success',
    output_path: payload.output_path,
    duration: Math.round((audio.length / sampleRate) * 100) / 100,
    sample_rate: sampleRate,
    process_time: null,
    model_id: MODEL_ID,
  };
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
}

main().catch((err) => {
  process.stderr.write(err.message || String(err));
  process.exit(1);
});
