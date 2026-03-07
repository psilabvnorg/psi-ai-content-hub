// Re-exports from audio-showcase. Audio-karaoke shares the same schema and metadata
// calculation for now. When karaoke-specific behaviour is needed (e.g. syllable timing,
// highlight colours), replace these re-exports with a dedicated implementation.
export type {AudioShowcaseResolvedProps as AudioKaraokeResolvedProps} from "../audio-showcase/calculateMetadata";
export {
  audioShowcaseResolvedPropsSchema as audioKaraokeResolvedPropsSchema,
  calculateAudioShowcaseMetadata as calculateAudioKaraokeMetadata,
} from "../audio-showcase/calculateMetadata";
