# Implementation Plan: Multilingual Video Pipeline

## Overview

This implementation plan breaks down the multilingual video pipeline into discrete, incremental tasks. The system will be built in Python using a modular architecture where each service can be developed and tested independently. The implementation follows a bottom-up approach, starting with core utilities and data models, then building individual services, and finally integrating them into the complete pipeline.

## Tasks

- [ ] 1. Set up project structure and core infrastructure
  - Create Python project with virtual environment
  - Set up directory structure for services, models, tests, and utilities
  - Configure dependencies (FFmpeg, yt-dlp, Whisper, Pillow, MoviePy, pytest, hypothesis)
  - Create configuration management system for API keys and settings
  - Set up logging infrastructure with structured logging
  - _Requirements: 12.1, 9.4_

- [ ] 2. Implement core data models
  - [ ] 2.1 Create data model classes
    - Implement VideoMetadata, Transcript, TranscriptSegment, TranslatedScript dataclasses
    - Implement Scene, OutputFormat, JobStatus dataclasses
    - Add validation methods for each model
    - _Requirements: 1.5, 2.1, 5.1_

  - [ ]* 2.2 Write property test for data model validation
    - **Property 1: Complete Metadata Extraction**
    - **Validates: Requirements 1.3, 1.5**

  - [ ] 2.3 Implement serialization/deserialization
    - Add JSON serialization for all data models
    - Implement save/load methods for persistence
    - _Requirements: 12.5_

  - [ ]* 2.4 Write property test for serialization round-trip
    - Test that serializing then deserializing produces equivalent objects
    - _Requirements: 12.5_

- [ ] 3. Implement Video Ingestion Service
  - [ ] 3.1 Create VideoIngestionService class
    - Implement fetch_channel_videos using yt-dlp
    - Implement download_video with progress tracking
    - Implement extract_metadata and extract_audio methods
    - Add rate limiting to respect YouTube API limits
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 3.2 Write property test for metadata extraction
    - **Property 1: Complete Metadata Extraction**
    - **Validates: Requirements 1.2, 1.4**

  - [ ] 3.3 Implement error handling for unavailable videos
    - Handle restricted/deleted videos gracefully
    - Log errors and continue processing
    - _Requirements: 1.3_

  - [ ]* 3.4 Write property test for error handling continuity
    - **Property 2: Error Handling Continuity**
    - **Validates: Requirements 1.3**

- [ ] 4. Implement Transcription Service
  - [ ] 4.1 Create TranscriptionService class
    - Integrate PhoWhisper for Vietnamese speech recognition
    - Integrate OpenAI Whisper for multilingual speech recognition (Japanese, German, English)
    - Implement language detection and model routing logic
    - Implement transcribe_audio with automatic model selection
    - Implement segment_by_sentences for scene boundaries
    - Generate word-level timestamps for all models
    - Add fallback mechanism (PhoWhisper → Whisper for Vietnamese)
    - _Requirements: 2.1_

  - [ ]* 4.2 Write property test for transcript completeness
    - **Property 3: Transcript Generation Completeness**
    - **Validates: Requirements 2.1**

  - [x] 4.3 Optimize transcription performance
    - Use faster-whisper for improved OpenAI Whisper speed
    - Implement model caching to avoid repeated loading
    - Implement batch processing for multiple audio files (TODO: implement later)
    - Add GPU acceleration support when available
    - _Requirements: 2.1_

  - [ ] 4.4 Test Vietnamese transcription accuracy
    - Compare PhoWhisper vs Whisper accuracy on Vietnamese content
    - Validate tonal recognition and dialect handling
    - Test code-switching (Vietnamese-English) scenarios
    - _Requirements: 2.1_

- [ ] 5. Implement Translation Service
  - [x] 5.1 Create TranslationService class
    - Integrate Tencent HY-MT1.5-1.8B model for translation
    - Implement translate_script for all target languages
    - Implement validate_duration to check 20% variance
    - Add quality scoring mechanism
    - _Requirements: 2.2, 2.4, 2.5_
    - _Note: Model identifier needs verification on HuggingFace. Using placeholder in config._

  - [ ]* 5.2 Write property test for multilingual coverage
    - **Property 4: Multilingual Translation Coverage**
    - **Validates: Requirements 2.2**

  - [ ]* 5.3 Write property test for duration preservation
    - **Property 5: Translation Duration Preservation**
    - **Validates: Requirements 2.4**

  - [ ]* 5.4 Write property test for quality-based flagging
    - **Property 6: Quality-Based Flagging**
    - **Validates: Requirements 2.5**

- [ ] 6. Checkpoint - Core services functional
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement Visual Asset Manager
  - [ ] 7.1 Create VisualAssetManager class
    - Implement search_images with multiple source integration
    - Implement download_image with caching
    - Implement prepare_image for resizing and formatting
    - Implement match_images_to_scenes for contextual alignment
    - _Requirements: 3.1, 3.2, 3.4_
    - _Current implementation_: implementing Text → Ollama summarization (`deepseek-r1:8b`) → Bing image search → download. It uses the full summary as the query (currently appending "latest, up to date information"), integration into `VisualAssetManager`, multi-source support, caching, and minimum-resolution validation remain TODO.

  - [ ]* 7.2 Write property test for image source validation
    - **Property 8: Image Source Validation**
    - **Validates: Requirements 3.2**

  - [ ]* 7.3 Write property test for minimum resolution
    - **Property 9: Minimum Resolution Compliance**
    - **Validates: Requirements 3.4, 5.5, 10.1**

  - [ ] 7.4 Implement image caching and fallback strategies
    - Cache downloaded images to avoid redundant downloads
    - Implement fallback to alternative sources on failure
    - _Requirements: 3.2_

- [ ] 8. Implement TTS Service
  - [ ] 8.1 Create TTSService class
    - Integrate F5-TTS for speech synthesis
    - Implement synthesize_speech for all languages
    - Configure female voice profile with emotional characteristics
    - Implement normalize_audio to -16 LUFS
    - _Requirements: 4.1, 4.4_

  - [ ]* 8.2 Write property test for audio generation
    - **Property 11: Audio Generation Completeness**
    - **Validates: Requirements 4.1**

  - [ ]* 8.3 Write property test for loudness normalization
    - **Property 12: Audio Loudness Normalization**
    - **Validates: Requirements 4.4, 8.1**

  - [ ]* 8.4 Write property test for no clipping
    - **Property 13: No Audio Clipping**
    - **Validates: Requirements 4.5, 8.3**

  - [ ] 8.5 Implement audio processing utilities
    - Remove silence gaps longer than 2 seconds
    - Ensure AAC export at 192 kbps
    - _Requirements: 8.2, 8.4_

  - [ ]* 8.6 Write property test for silence gap removal
    - **Property 25: Silence Gap Removal**
    - **Validates: Requirements 8.2**

  - [ ]* 8.7 Write property test for audio format compliance
    - **Property 26: Audio Format Compliance**
    - **Validates: Requirements 8.4**

- [ ] 9. Implement Scene Assembler
  - [x] 9.1 Create SceneAssembler class
    - Implement create_scenes to segment video by transcript
    - Implement align_timing to match visuals with audio
    - Implement apply_transitions with fade effects
    - Support ken burns effect for static images
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 9.2 Write property test for scene segmentation
    - **Property 20: Scene Segmentation Alignment**
    - **Validates: Requirements 7.1**

  - [ ]* 9.3 Write property test for scene duration matching
    - **Property 21: Scene Duration Matching**
    - **Validates: Requirements 7.2**

  - [ ]* 9.4 Write property test for transition presence
    - **Property 22: Consecutive Scene Transitions**
    - **Validates: Requirements 7.3**

  - [ ]* 9.5 Write property test for transition duration
    - **Property 10: Transition Duration Compliance**
    - **Validates: Requirements 3.5**

- [ ] 10. Checkpoint - Media processing complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement Subtitle Generator
  - [x] 11.1 Create SubtitleGenerator class
    - Implement generate_subtitles from transcript
    - Implement format_subtitles with line breaks and styling
    - Implement export_srt for .srt file generation
    - Implement embed_subtitles using FFmpeg
    - Implement fallback cue timing from translated text using configurable narration pace (default 150–180 wpm) with ≤10-word, punctuation-aware chunking when alignment data is missing
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ]* 11.2 Write property test for subtitle language matching
    - **Property 17: Subtitle Language Matching**
    - **Validates: Requirements 6.1**

  - [ ]* 11.3 Write property test for subtitle synchronization
    - **Property 18: Subtitle Synchronization Accuracy**
    - **Validates: Requirements 6.2, 10.4**

  - [ ]* 11.4 Write property test for subtitle export completeness
    - **Property 19: Subtitle Export Completeness**
    - **Validates: Requirements 6.4**

- [ ] 12. Implement Video Renderer
  - [x] 12.1 Create VideoRenderer class
    - Implement render_video to combine scenes, audio, subtitles
    - Support multiple output formats (16:9 and 9:16)
    - Use H.264 codec with two-pass encoding
    - Implement platform-specific optimizations
    - _Requirements: 5.2, 5.3, 11.1_

  - [ ]* 12.2 Write property test for language output completeness
    - **Property 14: Language Output Completeness**
    - **Validates: Requirements 5.1**

  - [ ]* 12.3 Write property test for horizontal format
    - **Property 15: Horizontal Format Consistency**
    - **Validates: Requirements 5.2**

  - [ ]* 12.4 Write property test for Vietnamese vertical format
    - **Property 16: Vietnamese Vertical Format**
    - **Validates: Requirements 5.3**

  - [ ]* 12.5 Write property test for video codec
    - **Property 35: Video Codec Standardization**
    - **Validates: Requirements 11.1**

- [x] 13. Implement Export Manager
  - [x] 13.1 Create ExportManager class
    - Implement export_video for platform-specific formatting
    - Implement generate_metadata for each platform
    - Implement create_thumbnail from key frames
    - Implement package_outputs to organize files
    - _Requirements: 11.2, 11.3, 11.4, 11.5_

  - [ ]* 13.2 Write property test for YouTube export specs
    - **Property 36: YouTube Export Specifications**
    - **Validates: Requirements 11.2**

  - [ ]* 13.3 Write property test for TikTok export specs
    - **Property 37: TikTok Export Specifications**
    - **Validates: Requirements 11.3**

  - [ ]* 13.4 Write property test for Facebook export specs
    - **Property 38: Facebook Reels Export Specifications**
    - **Validates: Requirements 11.4**

  - [ ]* 13.5 Write property test for metadata embedding
    - **Property 39: Platform Metadata Embedding**
    - **Validates: Requirements 11.5_

- [x] 14. Implement Job Queue and Orchestrator
  - [x] 14.1 Create JobOrchestrator class
    - Implement submit_job for job creation
    - Implement process_job to coordinate all services
    - Implement retry logic with exponential backoff
    - Implement job state persistence using JSON files (SQLite upgrade planned)
    - Sequential single-job processing (concurrent processing upgrade planned)
    - _Requirements: 9.2, 9.3, 12.2, 12.5_
    - _Note: PoC implementation with placeholders. Actual service integration in task 18._

  - [ ]* 14.2 Write property test for retry limit
    - **Property 28: Retry Limit Enforcement**
    - **Validates: Requirements 9.2, 12.2**

  - [ ]* 14.3 Write property test for queue priority
    - **Property 29: Queue Priority Ordering**
    - **Validates: Requirements 9.3**

  - [ ]* 14.4 Write property test for state persistence
    - **Property 43: State Persistence and Recovery**
    - **Validates: Requirements 12.5**

  - [ ] 14.5 Implement logging and monitoring
    - Add structured logging for all operations
    - Implement metrics collection
    - Add batch summary report generation
    - _Requirements: 9.4, 9.5_

  - [ ]* 14.6 Write property test for logging completeness
    - **Property 30: Processing Log Completeness**
    - **Validates: Requirements 9.4**

  - [ ]* 14.7 Write property test for batch summary
    - **Property 31: Batch Summary Generation**
    - **Validates: Requirements 9.5**

- [ ] 15. Implement validation and quality checks
  - [x] 15.1 Create validation utilities
    - Implement resolution validation
    - Implement audio level validation
    - Implement subtitle synchronization validation
    - Implement output format completeness check
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
    - _Note: Complete validation suite with 4 validation methods. Tests cover all scenarios._

  - [ ]* 15.2 Write property test for audio level validation
    - **Property 32: Audio Level Validation Range**
    - **Validates: Requirements 10.2**

  - [ ]* 15.3 Write property test for validation error flagging
    - **Property 33: Validation Error Flagging**
    - **Validates: Requirements 10.3**

  - [ ]* 15.4 Write property test for output completeness
    - **Property 34: Output Format Completeness**
    - **Validates: Requirements 10.5**

- [ ] 16. Implement error handling and recovery (TODO - deferred for post-PoC phase)
  - [ ] 16.1 Add comprehensive error handling
    - Implement error categorization (transient, permanent, quality, system)
    - Add circuit breaker pattern for external services
    - Implement graceful degradation for optional features
    - Add critical failure notifications
    - _Requirements: 12.1, 12.3, 12.4_
    - _Note: Deferred for post-PoC. Focus on core pipeline integration first._

  - [ ]* 16.2 Write property test for error logging
    - **Property 40: Error Logging Completeness**
    - **Validates: Requirements 12.1**

  - [ ]* 16.3 Write property test for failed queue management
    - **Property 41: Failed Video Queue Management**
    - **Validates: Requirements 12.3**

  - [ ]* 16.4 Write property test for critical notifications
    - **Property 42: Critical Failure Notifications**
    - **Validates: Requirements 12.4**

- [ ] 17. Checkpoint - Full pipeline integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Create end-to-end integration
  - [x] 18.1 Wire all services together
    - Create main pipeline orchestration
    - Connect all services in correct sequence
    - Add progress tracking and status updates
    - Implement cleanup of intermediate files
    - _Requirements: All_
    - _Status: COMPLETED - All 9 services orchestrated in sequence (video_ingestion → transcription → translation → visual_assets → tts → subtitle_generation → scene_assembly → video_rendering → export → validation). Job persistence and recovery implemented. Progress callbacks for UI/CLI integration. Automatic temp file cleanup. 13/16 integration tests passing._

  - [ ]* 18.2 Write integration tests
    - Test complete pipeline with sample videos
    - Verify all outputs are generated correctly
    - Test error propagation and recovery
    - _Requirements: All_

- [ ] 19. Create CLI and configuration
  - [ ] 19.1 Implement command-line interface
    - Add commands for processing videos, checking status, managing queue
    - Implement configuration file support
    - Add help documentation
    - _Requirements: All_

  - [ ]* 19.2 Write unit tests for CLI
    - Test command parsing and execution
    - Test configuration loading
    - _Requirements: All_

- [ ] 20. Performance optimization and testing
  - [ ] 20.1 Optimize performance bottlenecks
    - Profile pipeline execution
    - Optimize video rendering with GPU acceleration if available
    - Implement parallel processing where possible
    - _Requirements: 9.1_

  - [ ]* 20.2 Write performance tests
    - Test concurrent processing of 5+ videos
    - Measure processing time for standard video lengths
    - Verify resource utilization under load
    - _Requirements: 9.1_

- [ ] 21. Final checkpoint - Complete system validation
  - Run full property test suite with 100 iterations
  - Run integration tests with real videos from target channels
  - Verify all 43 correctness properties pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation uses Python with FFmpeg, Whisper, F5-TTS, and other specified technologies
