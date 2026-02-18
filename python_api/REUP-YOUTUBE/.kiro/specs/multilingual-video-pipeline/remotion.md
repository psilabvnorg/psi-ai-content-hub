# Remotion Integration Specification

## Overview

Remotion is a React-based programmatic video creation framework that enables rendering videos using HTML/CSS/React instead of traditional video editing tools. This document outlines how Remotion can be integrated into the Multilingual Video Pipeline to enhance the Video Renderer and Scene Assembler components.

**Documentation Reference**: https://www.remotion.dev/docs/

## Executive Summary

Remotion provides frame-by-frame video composition control through React components, making it ideal for:
- Precise audio-visual synchronization
- Sequential scene composition with automatic timing
- Built-in transition effects library
- Server-side rendering via Node.js APIs
- Scalable cloud rendering (AWS Lambda, Docker, GitHub Actions)

## Key Remotion Capabilities

### 1. Programmatic Video Creation with React

Remotion treats videos as functions of time, rendering frame-by-frame through React components.

**Core Concepts:**
- Videos are defined by: `width`, `height`, `durationInFrames`, and `fps`
- Access current frame via `useCurrentFrame()` hook
- Content renders based on frame number for precise control
- Server-side rendering via `@remotion/renderer` package

**Example:**
```typescript
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export const MyComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      Frame {frame} of {durationInFrames}
    </AbsoluteFill>
  );
};
```

### 2. Scene Management with `<Sequence>` and `<Series>`

#### `<Sequence>` Component
- **Purpose**: Time-shift display of components to specific frames
- **Props**:
  - `from`: Starting frame number
  - `durationInFrames`: How long to display (optional)
  - `name`: Label for timeline visualization
  - `layout`: "absolute-fill" (default) or "none"
- **Features**: Nesting support with cascading frame calculations

**Example - Timeline Structure:**
```typescript
<>
  <Sequence durationInFrames={30}>
    <Intro />
  </Sequence>
  <Sequence from={30} durationInFrames={30}>
    <Clip />
  </Sequence>
  <Sequence from={60}>
    <Outro />
  </Sequence>
</>
```

#### `<Series>` Component
- **Purpose**: Automatically chain sequences sequentially
- **Benefit**: Eliminates manual timing calculations for sequential playback
- **Props**:
  - `durationInFrames`: For each nested `<Series.Sequence>`
  - `offset`: Positive (delay) or negative (overlap) for transitions
  - `layout`: Container layout control

**Example - Automatic Sequential Playback:**
```typescript
<Series>
  <Series.Sequence durationInFrames={40}>
    <Scene1 />
  </Series.Sequence>
  <Series.Sequence durationInFrames={20}>
    <Scene2 />
  </Series.Sequence>
  <Series.Sequence durationInFrames={70}>
    <Scene3 />
  </Series.Sequence>
</Series>
```

### 3. Built-in Audio Synchronization

#### `<Html5Audio>` Component
- **Purpose**: Embed and control audio with frame-accurate timing

**Key Features:**
- `src`: Audio file path (local or remote)
- `volume`: Static value (0-1) or dynamic callback per frame
- `trimBefore` / `trimAfter`: Remove portions of audio (in frames)
- `playbackRate`: Speed control (0.0625 to 16)
- `muted`: Conditional muting per frame
- `toneFrequency`: Pitch adjustment (0.01 to 2)

**Example - Volume Control Over Time:**
```typescript
<Html5Audio
  src={staticFile('narration.mp3')}
  volume={(frame) => interpolate(
    frame,
    [0, 30],
    [0, 1],
    { extrapolateLeft: 'clamp' }
  )}
/>
```

**Example - Trim Audio:**
```typescript
// Trim first 2 seconds (at 30fps) and last 4 seconds
<Html5Audio
  src={staticFile('audio.mp3')}
  trimBefore={60}
  trimAfter={120}
/>
```

### 4. Transition Effects Library

#### `@remotion/transitions` Package

**Available Presentations:**
- `fade()`: Animate opacity between scenes
- `slide()`: Slide in and push out previous scene
- `wipe()`: Slide over previous scene
- `flip()`: Rotate previous scene
- `clockWipe()`: Circular movement reveal
- `iris()`: Circular mask from center
- `cube()` (paid): 3D cube rotation
- Custom presentations supported

**Timing Functions:**
- `linearTiming()`: Linear interpolation with optional easing
- `springTiming()`: Spring physics for natural motion
- Custom timing implementations

**Example - TransitionSeries:**
```typescript
<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60}>
    <Image1 />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    timing={springTiming({ fps, durationInFrames: 30 })}
    presentation={fade()}
  />
  <TransitionSeries.Sequence durationInFrames={60}>
    <Image2 />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

### 5. Image Handling with `<Img>`

#### `<Img>` Component
- **Purpose**: Load and display images with built-in reliability
- **Features**:
  - Automatic image loading state management
  - Retry logic (default: 2 retries with exponential backoff)
  - `onError` handler for custom error management
  - Prevention of render flickers
  - Support for local (`staticFile()`) and remote URLs

**Example:**
```typescript
<Img
  src={staticFile('scene.jpg')}
  maxRetries={3}
  onError={(event) => {
    // Handle image loading failure
  }}
/>
```

### 6. Server-Side Rendering API

#### `@remotion/renderer` Package

**Primary Functions:**
- `renderMedia()`: Complete video rendering in one step (preferred)
- `renderFrames()` + `stitchFramesToVideo()`: Frame-by-frame rendering with stitching
- `renderStill()`: Render single frame as image
- `getCompositions()`: List available compositions
- `openBrowser()` / `ensureBrowser()`: Reuse Chrome across renders for performance

**Example - Basic Render:**
```javascript
import { renderMedia } from '@remotion/renderer';

await renderMedia({
  composition: myComposition,
  fps: 30,
  numberOfFrames: 900,
  codec: 'h264',
  crf: 18,
  outputLocation: './output.mp4',
});
```

**Deployment Targets:**
- **AWS Lambda**: Via `@remotion/lambda` for cloud scaling
- **Docker**: Containerized rendering
- **GitHub Actions**: CI/CD integration
- **GCP Cloud Run**: Alpha support
- **Local/VPS**: Direct Node.js execution

## Proposed Integration Architecture

### 1. Replace Scene Assembler with Remotion `<Series>`

**Current Approach:**
- Manual timing calculations for scene alignment
- MoviePy-based composition with frame-by-frame assembly

**Remotion Approach:**
```python
# Updated Python interface
class RemotionSceneAssembler:
    def create_composition_config(
        self,
        scenes: List[Scene],
        audio: AudioFile,
        fps: int = 30
    ) -> Dict:
        """Convert scenes to Remotion composition configuration"""
        composition = {
            'id': 'MultilingualVideo',
            'fps': fps,
            'scenes': []
        }
        
        for scene in scenes:
            frame_duration = int(scene.duration * fps)
            composition['scenes'].append({
                'image': scene.image_path,
                'duration_frames': frame_duration,
                'transition': 'fade',  # Or 'slide', 'wipe', etc.
                'transition_duration_frames': 15  # 0.5 seconds at 30fps
            })
        
        return composition

    def generate_react_composition(self, config: Dict) -> str:
        """Generate React JSX from configuration"""
        # Outputs TypeScript/JSX for Remotion rendering
        pass
```

**Benefits:**
- Automatic sequential timing via `<Series>`
- Built-in fade/slide transitions
- Frame-perfect synchronization

### 2. Replace Video Renderer with Remotion `@remotion/renderer`

**Current Approach:**
- FFmpeg-based rendering
- MoviePy Python wrapper
- Manual codec and quality settings

**Remotion Approach:**
```python
# Updated Python Video Renderer
class RemotionVideoRenderer:
    def render_video(
        self,
        composition_path: str,
        audio_file: str,
        subtitles: SubtitleTrack,
        format: OutputFormat
    ) -> VideoFile:
        """Render video using Remotion via Node.js subprocess"""
        
        config = {
            'composition': composition_path,
            'audioPath': audio_file,
            'width': format.resolution[0],
            'height': format.resolution[1],
            'fps': 30,
            'codec': 'h264',
            'crf': 18,  # Quality (lower = better, slower)
            'outputLocation': format.output_path,
            'numberOfFrames': self.calculate_frames(audio_file)
        }
        
        # Call Node.js renderer
        result = self._invoke_remotion_renderer(config)
        
        # Apply subtitles post-render
        self._embed_subtitles(result.video_path, subtitles)
        
        return VideoFile(result.video_path)

    def _invoke_remotion_renderer(self, config: Dict) -> RenderResult:
        """Execute Remotion rendering via Node.js"""
        # Use subprocess to call Node.js render script
        pass
```

### 3. Add Remotion Service Layer

**New TypeScript/Node.js Module:**

```typescript
// src/services/remotion-service.ts
import { renderMedia } from '@remotion/renderer';
import { Composition, Sequence, Series, Html5Audio, Img } from 'remotion';

export interface SceneConfig {
  imagePath: string;
  durationFrames: number;
  transitionType: 'fade' | 'slide' | 'wipe';
  transitionDurationFrames: number;
}

export interface CompositionConfig {
  id: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  scenes: SceneConfig[];
  audioPath: string;
}

export const createMultilingualComposition = (
  config: CompositionConfig
): React.FC => {
  return () => (
    <Series>
      {config.scenes.map((scene, idx) => (
        <Series.Sequence
          key={idx}
          durationInFrames={scene.durationFrames}
        >
          <Img src={scene.imagePath} style={{ width: '100%', height: '100%' }} />
        </Series.Sequence>
      ))}
    </Series>
  );
};

export const renderMultilingualVideo = async (
  config: CompositionConfig,
  outputPath: string
): Promise<void> => {
  const composition = createMultilingualComposition(config);
  
  await renderMedia({
    composition,
    fps: config.fps,
    numberOfFrames: config.durationInFrames,
    codec: 'h264',
    crf: 18,
    outputLocation: outputPath,
    audio: config.audioPath,
  });
};
```

## Integration Workflow

### Step 1: Scene Assembly (Python)
```
Transcription → Scene Segmentation → Image Assets → Scene Configuration JSON
```

### Step 2: Configuration Generation (Python)
```
Scene Configuration → Remotion Composition Config → JSON File
```

### Step 3: React Composition Generation (Node.js)
```
Composition Config → React JSX → Compiled TypeScript
```

### Step 4: Video Rendering (Node.js)
```
React Composition + Audio → Remotion Renderer → MP4 Output
```

### Step 5: Post-Processing (Python)
```
MP4 + Subtitles → FFmpeg (subtitle embedding) → Final Video
```

## Design Rationale

### Why Remotion for Video Rendering?

1. **Frame-Perfect Timing**
   - Eliminates timing drift issues from MoviePy/FFmpeg
   - Addresses Property 18 (Subtitle Synchronization Accuracy)
   - Addresses Property 21 (Scene Duration Matching)

2. **Native Audio Synchronization**
   - Built-in audio component with frame-level control
   - Volume curves for audio ducking (Property 27)
   - Trim operations without re-encoding

3. **Professional Transitions**
   - Pre-built, tested transition library
   - Meets Property 10 (Transition Duration Compliance)
   - Customizable timing via spring/linear functions

4. **Scalable Rendering**
   - AWS Lambda support for concurrent video rendering
   - Faster processing than sequential FFmpeg calls
   - Cost-effective cloud rendering

5. **Maintainability**
   - React-based composition is more readable than FFmpeg scripts
   - Type-safe TypeScript implementation
   - Easier to extend with custom effects

### Why Keep Python for Orchestration?

1. **Existing Ecosystem**
   - Whisper, translation models already in Python
   - TTS service in Python (F5-TTS)
   - Minimal disruption to pipeline

2. **Separation of Concerns**
   - Python handles: ingestion, transcription, translation, TTS, validation
   - Node.js handles: composition, rendering
   - Clear interface: JSON configuration files

3. **Process Isolation**
   - Python subprocess calls Node.js renderer
   - Better error handling and resource management
   - Easier to scale or replace rendering later

## Implementation Phases

### Phase 1: Proof of Concept (Week 1-2)
- Set up Remotion project in TypeScript
- Create basic composition with static image + audio
- Test `renderMedia()` API
- Measure rendering performance vs. current MoviePy approach

### Phase 2: Scene Assembler Integration (Week 3-4)
- Modify `SceneAssembler` to output JSON configuration
- Create Remotion service to consume configuration
- Implement `<Series>` with dynamic scene sequences
- Test with actual transcribed scenes

### Phase 3: Video Renderer Integration (Week 5-6)
- Replace MoviePy calls with Remotion renderer
- Implement post-render subtitle embedding
- Test output quality and timing accuracy
- Profile performance across different resolutions

### Phase 4: Transition Effects (Week 7-8)
- Integrate `@remotion/transitions` package
- Configure transition timings per scene
- Test transition smoothness at different FPS

### Phase 5: Cloud Rendering (Week 9-10)
- Set up AWS Lambda via `@remotion/lambda`
- Implement concurrent batch rendering
- Cost analysis vs. local rendering

### Phase 6: Testing & Validation (Week 11-12)
- Property-based testing for timing accuracy
- Integration testing with full pipeline
- Performance benchmarking
- Documentation and team training

## Technology Stack Additions

### Required Dependencies
```json
{
  "dependencies": {
    "remotion": "^4.0.x",
    "@remotion/renderer": "^4.0.x",
    "@remotion/transitions": "^4.0.x",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### System Requirements
- Node.js 16+ or Bun 1.0.3+
- Chrome/Chromium (used by Remotion for rendering)
- FFmpeg (for subtitle embedding, audio extraction)
- Linux: libc 2.35+, additional packages may be required

## Deployment Considerations

### Option 1: Local Rendering
- Suitable for: Development, small batch processing
- Runtime: 1-3 minutes per video (depends on duration)
- Hardware: Modern CPU with 4+ cores, 8GB+ RAM recommended

### Option 2: AWS Lambda via `@remotion/lambda`
- Suitable for: Production, high-volume processing
- Cost: ~$0.02 per minute of rendering
- Scaling: Automatic, parallel processing

### Option 3: Docker Containerization
- Suitable for: Containerized deployment, custom infrastructure
- Requirements: Docker, Chrome/Chromium in container

## Potential Challenges & Mitigations

| Challenge | Mitigation |
|-----------|-----------|
| **Language Boundary (Python↔Node.js)** | Use JSON config files as interface; clear schema validation |
| **Subtitle Embedding** | Keep FFmpeg for post-render subtitle operations |
| **Learning Curve (React)** | Provide template compositions; documentation; team training |
| **Licensing** | Remotion requires commercial license; budget accordingly |
| **Image Optimization** | Validate image dimensions pre-render; implement smart caching |
| **Performance Testing** | Benchmark against MoviePy baseline; profile rendering times |

## Correctness Properties Addressed

| Property | How Remotion Helps |
|----------|-------------------|
| **Property 10** (Transition Duration) | Built-in timing with configurable duration |
| **Property 18** (Subtitle Sync Accuracy) | Frame-accurate audio playback, <100ms offset achievable |
| **Property 21** (Scene Duration Matching) | Sequence timing tied directly to duration config |
| **Property 22** (Consecutive Transitions) | `<TransitionSeries>` ensures transitions between all scenes |
| **Property 27** (Audio Ducking) | Volume callback per frame for music reduction during narration |

## Testing Strategy

### Unit Tests
- React composition rendering with mock data
- Configuration validation and JSON schema tests
- Audio trimming calculations

### Integration Tests
- End-to-end rendering of multi-scene compositions
- Audio-visual synchronization verification
- Transition timing accuracy

### Performance Tests
- Rendering time benchmarks
- Memory usage profiling
- Concurrent render throughput

### Property Tests
- Timing accuracy across different FPS and durations
- Volume envelope correctness
- Transition smoothness validation

## References

- **Official Documentation**: https://www.remotion.dev/docs/
- **API Reference**: https://www.remotion.dev/docs/api
- **Server-Side Rendering**: https://www.remotion.dev/docs/ssr
- **Transitions Package**: https://www.remotion.dev/docs/transitions
- **Audio Documentation**: https://www.remotion.dev/docs/html5-audio
- **GitHub Repository**: https://github.com/remotion-dev/remotion

## Conclusion

Integrating Remotion provides a modern, scalable approach to video rendering that maintains Python pipeline compatibility while adding professional-grade video composition capabilities. The frame-by-frame control, native audio handling, and cloud rendering support make it an excellent fit for the Multilingual Video Pipeline's requirements.

The proposed phased implementation allows for incremental adoption with minimal disruption to existing pipeline components, with the potential for significant performance improvements and feature enhancements.
