import type { Caption } from '@remotion/captions';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeMsRange = (startMs: number, endMs: number) => {
  const safeStartMs = Math.round(startMs);
  const safeEndMs = Math.max(safeStartMs + 1, Math.round(endMs));

  return { safeStartMs, safeEndMs };
};

const normalizeCaptionLike = (value: unknown): Caption | null => {
  if (!isRecord(value)) {
    return null;
  }

  const text = value.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  const startMs = toFiniteNumber(value.startMs);
  const endMs = toFiniteNumber(value.endMs);
  if (startMs === null || endMs === null) {
    return null;
  }

  const { safeStartMs, safeEndMs } = normalizeMsRange(startMs, endMs);
  const timestampCandidate = toFiniteNumber(value.timestampMs);
  const confidenceCandidate = toFiniteNumber(value.confidence);

  return {
    text,
    startMs: safeStartMs,
    endMs: safeEndMs,
    timestampMs:
      timestampCandidate === null
        ? Math.round((safeStartMs + safeEndMs) / 2)
        : Math.round(timestampCandidate),
    confidence: confidenceCandidate,
  };
};

const normalizeWordCaption = (wordValue: unknown): Caption | null => {
  if (!isRecord(wordValue)) {
    return null;
  }

  const text = wordValue.word;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  const startSec = toFiniteNumber(wordValue.start);
  const endSec = toFiniteNumber(wordValue.end);
  if (startSec === null || endSec === null) {
    return null;
  }

  const startMs = startSec * 1000;
  const endMs = endSec * 1000;
  const { safeStartMs, safeEndMs } = normalizeMsRange(startMs, endMs);
  const confidenceCandidate = toFiniteNumber(wordValue.probability);

  return {
    text,
    startMs: safeStartMs,
    endMs: safeEndMs,
    timestampMs: Math.round((safeStartMs + safeEndMs) / 2),
    confidence: confidenceCandidate,
  };
};

const normalizeSegmentCaption = (segmentValue: unknown): Caption | null => {
  if (!isRecord(segmentValue)) {
    return null;
  }

  const text = segmentValue.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  const startSec = toFiniteNumber(segmentValue.start);
  const endSec = toFiniteNumber(segmentValue.end);
  if (startSec === null || endSec === null) {
    return null;
  }

  const startMs = startSec * 1000;
  const endMs = endSec * 1000;
  const { safeStartMs, safeEndMs } = normalizeMsRange(startMs, endMs);

  return {
    text,
    startMs: safeStartMs,
    endMs: safeEndMs,
    timestampMs: Math.round((safeStartMs + safeEndMs) / 2),
    confidence: null,
  };
};

const sortCaptions = (captions: Caption[]): Caption[] => {
  return captions
    .slice()
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
};

export const normalizeCaptions = (input: unknown): Caption[] => {
  if (Array.isArray(input)) {
    const captionArray = input
      .map(normalizeCaptionLike)
      .filter((caption): caption is Caption => caption !== null);
    return sortCaptions(captionArray);
  }

  if (!isRecord(input)) {
    return [];
  }

  if (Array.isArray(input.captions)) {
    const captionArray = input.captions
      .map(normalizeCaptionLike)
      .filter((caption): caption is Caption => caption !== null);
    return sortCaptions(captionArray);
  }

  if (!Array.isArray(input.segments)) {
    return [];
  }

  const normalized: Caption[] = [];

  for (const segmentValue of input.segments) {
    if (!isRecord(segmentValue)) {
      continue;
    }

    const words = Array.isArray(segmentValue.words) ? segmentValue.words : [];
    const wordCaptions = words
      .map(normalizeWordCaption)
      .filter((caption): caption is Caption => caption !== null);

    if (wordCaptions.length > 0) {
      normalized.push(...wordCaptions);
      continue;
    }

    const fallbackSegmentCaption = normalizeSegmentCaption(segmentValue);
    if (fallbackSegmentCaption) {
      normalized.push(fallbackSegmentCaption);
    }
  }

  return sortCaptions(normalized);
};
