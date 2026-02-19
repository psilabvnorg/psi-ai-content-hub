# Remotion Setup Guide for Multilingual Video Pipeline

This guide walks through setting up Remotion alongside the existing Python pipeline.

## Project Structure

```
/home/psilab/REUP-YOUTUBE/
├── src/                              # Python source (existing)
│   └── multilingual_video_pipeline/
├── remotion-render/                  # NEW: Remotion TypeScript/Node.js
│   ├── src/
│   │   ├── compositions/
│   │   │   └── MultilingualVideo.tsx
│   │   ├── services/
│   │   │   └── remotion-renderer.ts
│   │   └── Root.tsx
│   ├── public/                       # Images will be placed here at render time
│   ├── package.json
│   ├── tsconfig.json
│   ├── remotion.config.ts
│   └── .gitignore
├── scripts/                          # Python scripts (existing)
├── tests/                            # Tests (existing)
└── cache/                            # Cache (existing)
```

## Step 1: Create Remotion Project Directory

```bash
cd /home/psilab/REUP-YOUTUBE
mkdir -p remotion-render
cd remotion-render
```

## Step 2: Initialize Node.js Project

```bash
npm init -y
```

Edit `package.json`:

```json
{
  "name": "multilingual-video-remotion",
  "version": "1.0.0",
  "description": "Remotion rendering service for Multilingual Video Pipeline",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "dev": "remotion studio",
    "build": "remotion build",
    "render": "remotion render",
    "render-video": "node dist/render.js"
  },
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
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0"
  }
}
```

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Create TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Step 5: Create Remotion Configuration

Create `remotion.config.ts`:

```typescript
import { Config } from 'remotion';

Config.setVideoImageFormat('png');
Config.setConcurrency(4);
Config.setFrameRange([0, 300]); // Default frame range
Config.setPixelFormat('yuv420p'); // Better compatibility
Config.setCodec('h264');
Config.setCrf(18); // Quality: 0-51 (lower = better, slower)
Config.setBrowserExecutable(process.env.CHROMIUM_PATH);
```

## Step 6: Create Root Composition Registry

Create `src/Root.tsx`:

```typescript
import React from 'react';
import { Composition } from 'remotion';
import { MultilingualVideo } from './compositions/MultilingualVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MultilingualVideo"
      component={MultilingualVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        scenes: [],
        audioPath: '',
      }}
    />
  );
};
```

## Step 7: Create Base Composition Component

Create `src/compositions/MultilingualVideo.tsx`:

```typescript
import React from 'react';
import { Series, Sequence } from 'remotion';
import { Html5Audio } from 'remotion';

export interface Scene {
  imagePath: string;
  durationFrames: number;
  transitionType?: 'fade' | 'slide' | 'wipe';
  transitionDurationFrames?: number;
}

export interface MultilingualVideoProps {
  scenes: Scene[];
  audioPath: string;
}

export const MultilingualVideo: React.FC<MultilingualVideoProps> = ({
  scenes,
  audioPath,
}) => {
  return (
    <>
      {/* Audio Track */}
      {audioPath && <Html5Audio src={audioPath} />}
      
      {/* Video Scenes */}
      <Series>
        {scenes.map((scene, idx) => (
          <Series.Sequence
            key={idx}
            durationInFrames={scene.durationFrames}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url(${scene.imagePath})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          </Series.Sequence>
        ))}
      </Series>
    </>
  );
};
```

## Step 8: Create Remotion Renderer Service

Create `src/services/remotion-renderer.ts`:

```typescript
import { renderMedia } from '@remotion/renderer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RenderOptions {
  scenes: Array<{
    imagePath: string;
    durationFrames: number;
  }>;
  audioPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
  codec?: 'h264' | 'vp8' | 'vp9' | 'prores' | 'h265';
  crf?: number;
}

export async function renderMultilingualVideo(options: RenderOptions) {
  const {
    scenes,
    audioPath,
    outputPath,
    width = 1920,
    height = 1080,
    fps = 30,
    codec = 'h264',
    crf = 18,
  } = options;

  // Calculate total duration
  const totalFrames = scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);

  try {
    console.log(`Rendering video to: ${outputPath}`);
    console.log(`Total frames: ${totalFrames} at ${fps}fps`);
    console.log(`Duration: ${(totalFrames / fps).toFixed(2)} seconds`);

    const result = await renderMedia({
      composition: {
        id: 'MultilingualVideo',
        component: (await import('../compositions/MultilingualVideo')).MultilingualVideo,
        durationInFrames: totalFrames,
        fps,
        width,
        height,
        defaultProps: {
          scenes,
          audioPath,
        },
      },
      serveUrl: 'http://localhost:3000', // For local rendering
      codec,
      crf,
      outputLocation: outputPath,
      onProgress: (progress) => {
        console.log(`Progress: ${(progress * 100).toFixed(1)}%`);
      },
    });

    console.log(`Video rendered successfully: ${outputPath}`);
    return result;
  } catch (error) {
    console.error('Rendering failed:', error);
    throw error;
  }
}
```

## Step 9: Create Render Entry Point

Create `src/render.ts`:

```typescript
import { renderMultilingualVideo } from './services/remotion-renderer.js';

// Example: Read configuration from stdin or file
async function main() {
  const configPath = process.argv[2];
  
  if (!configPath) {
    console.error('Usage: node dist/render.js <config.json>');
    process.exit(1);
  }

  try {
    const config = JSON.parse(await (await import('fs')).promises.readFile(configPath, 'utf-8'));
    
    await renderMultilingualVideo({
      scenes: config.scenes,
      audioPath: config.audioPath,
      outputPath: config.outputPath,
      width: config.width || 1920,
      height: config.height || 1080,
      fps: config.fps || 30,
      codec: config.codec || 'h264',
      crf: config.crf || 18,
    });

    console.log('Render completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Render failed:', error);
    process.exit(1);
  }
}

main();
```

## Step 10: Create `.gitignore`

Create `.remotion-render/.gitignore`:

```
node_modules/
dist/
*.mp4
*.mov
*.png
.env
.env.local
out/
coverage/
.DS_Store
*.log
```

## Step 11: Create Python Bridge Script

Create `src/multilingual_video_pipeline/services/remotion_renderer_service.py`:

```python
import json
import subprocess
import os
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict

@dataclass
class Scene:
    image_path: str
    duration_frames: int
    transition_type: str = 'fade'
    transition_duration_frames: int = 15

@dataclass
class RenderConfig:
    scenes: List[Scene]
    audio_path: str
    output_path: str
    width: int = 1920
    height: int = 1080
    fps: int = 30
    codec: str = 'h264'
    crf: int = 18

class RemotionRendererService:
    def __init__(self, remotion_dir: str = None):
        """
        Initialize Remotion renderer service.
        
        Args:
            remotion_dir: Path to remotion-render directory.
                         Defaults to ../../../remotion-render from this file.
        """
        if remotion_dir is None:
            # Relative path from this file
            current_dir = Path(__file__).parent.parent.parent.parent
            remotion_dir = str(current_dir / 'remotion-render')
        
        self.remotion_dir = Path(remotion_dir)
        self.render_script = self.remotion_dir / 'dist' / 'render.js'
        
        if not self.remotion_dir.exists():
            raise FileNotFoundError(f"Remotion directory not found: {self.remotion_dir}")

    def render_video(self, config: RenderConfig) -> str:
        """
        Render video using Remotion.
        
        Args:
            config: RenderConfig object with all rendering parameters
            
        Returns:
            Path to rendered video file
            
        Raises:
            RuntimeError: If rendering fails
        """
        # Create temporary config file
        config_path = Path(self.remotion_dir) / f'render_config_{os.getpid()}.json'
        
        try:
            # Prepare config for JSON serialization
            config_dict = {
                'scenes': [
                    {
                        'imagePath': scene.image_path,
                        'durationFrames': scene.duration_frames,
                        'transitionType': scene.transition_type,
                        'transitionDurationFrames': scene.transition_duration_frames,
                    }
                    for scene in config.scenes
                ],
                'audioPath': config.audio_path,
                'outputPath': config.output_path,
                'width': config.width,
                'height': config.height,
                'fps': config.fps,
                'codec': config.codec,
                'crf': config.crf,
            }
            
            # Write config file
            with open(config_path, 'w') as f:
                json.dump(config_dict, f, indent=2)
            
            print(f"Config written to: {config_path}")
            
            # Call Remotion render script
            result = subprocess.run(
                ['node', str(self.render_script), str(config_path)],
                cwd=str(self.remotion_dir),
                capture_output=True,
                text=True,
                timeout=3600  # 1 hour timeout
            )
            
            print(result.stdout)
            
            if result.returncode != 0:
                print(result.stderr)
                raise RuntimeError(f"Remotion rendering failed: {result.stderr}")
            
            if not Path(config.output_path).exists():
                raise RuntimeError(f"Output video not found: {config.output_path}")
            
            return config.output_path
            
        finally:
            # Clean up config file
            if config_path.exists():
                config_path.unlink()

# Usage example
if __name__ == '__main__':
    service = RemotionRendererService()
    
    config = RenderConfig(
        scenes=[
            Scene(image_path='image1.jpg', duration_frames=90),
            Scene(image_path='image2.jpg', duration_frames=90),
        ],
        audio_path='narration.mp3',
        output_path='output.mp4',
        width=1920,
        height=1080,
        fps=30,
    )
    
    video_path = service.render_video(config)
    print(f"Video rendered: {video_path}")
```

## Step 12: Build TypeScript

```bash
cd remotion-render
npm run build
```

Or use `tsx` for direct execution:

```bash
npx tsx src/render.ts render_config.json
```

## Step 13: Test Remotion Setup

### Option A: Visual Testing with Studio

```bash
cd remotion-render
npm run dev
```

This opens Remotion Studio at `http://localhost:3000` where you can preview compositions.

### Option B: Test Rendering from Python

Create a test script `test_remotion_integration.py`:

```python
import json
import tempfile
from pathlib import Path
from src.multilingual_video_pipeline.services.remotion_renderer_service import (
    RemotionRendererService,
    RenderConfig,
    Scene,
)

def test_remotion_rendering():
    """Test basic Remotion rendering."""
    
    service = RemotionRendererService()
    
    # Create minimal test images (1920x1080 JPEGs)
    # For now, assume they exist
    
    config = RenderConfig(
        scenes=[
            Scene(
                image_path='/path/to/image1.jpg',
                duration_frames=90,
                transition_type='fade',
                transition_duration_frames=15,
            ),
            Scene(
                image_path='/path/to/image2.jpg',
                duration_frames=90,
                transition_type='fade',
                transition_duration_frames=15,
            ),
        ],
        audio_path='/path/to/audio.mp3',
        output_path='/tmp/test_output.mp4',
        width=1920,
        height=1080,
        fps=30,
    )
    
    try:
        output_path = service.render_video(config)
        print(f"✓ Video rendered successfully: {output_path}")
        
        # Check output exists and has size
        output_size = Path(output_path).stat().st_size
        print(f"✓ Output file size: {output_size / 1024 / 1024:.2f} MB")
        
        return True
    except Exception as e:
        print(f"✗ Rendering failed: {e}")
        return False

if __name__ == '__main__':
    success = test_remotion_rendering()
    exit(0 if success else 1)
```

## Step 14: Integrate with Existing Pipeline

Update `src/multilingual_video_pipeline/services/__init__.py`:

```python
from .remotion_renderer_service import RemotionRendererService, RenderConfig, Scene

__all__ = [
    'RemotionRendererService',
    'RenderConfig',
    'Scene',
]
```

## Step 15: Update Video Renderer Service

Modify `src/multilingual_video_pipeline/services/video_renderer.py` to use Remotion:

```python
from .remotion_renderer_service import RemotionRendererService, RenderConfig, Scene
from pathlib import Path

class VideoRenderer:
    def __init__(self, remotion_dir: str = None):
        self.remotion_service = RemotionRendererService(remotion_dir)
    
    def render_video(
        self,
        scenes: List[Scene],
        audio_file: str,
        output_path: str,
        width: int = 1920,
        height: int = 1080,
        fps: int = 30,
    ) -> str:
        """Render video using Remotion."""
        
        config = RenderConfig(
            scenes=scenes,
            audio_path=audio_file,
            output_path=output_path,
            width=width,
            height=height,
            fps=fps,
        )
        
        return self.remotion_service.render_video(config)
```

## Development Workflow

### 1. Start Remotion Studio
```bash
cd remotion-render
npm run dev
```

### 2. Edit Compositions
- Modify `src/compositions/MultilingualVideo.tsx`
- View changes live in browser

### 3. Test Rendering
```bash
python test_remotion_integration.py
```

### 4. Build for Production
```bash
npm run build
```

## Troubleshooting

### Issue: `Module not found: @remotion/renderer`
**Solution**: Ensure all dependencies are installed
```bash
cd remotion-render
npm install
```

### Issue: Chromium not found
**Solution**: Install additional system packages
```bash
# Ubuntu/Debian
sudo apt-get install -y libnss3 libxss1 libasound2

# Or specify custom Chromium path
export CHROMIUM_PATH=/path/to/chrome
```

### Issue: Python can't find Remotion directory
**Solution**: Ensure paths are correct in `RemotionRendererService` initialization

### Issue: JSON parsing errors in render script
**Solution**: Validate JSON config file before passing to render script
```python
with open(config_path, 'r') as f:
    json.load(f)  # Validate before rendering
```

## Next Steps

1. **Implement Composition Variants**
   - Create different compositions for different aspect ratios (16:9, 9:16)
   - Add transition customization

2. **Add Subtitle Support**
   - Create subtitle composition overlay
   - Synchronize with audio timing

3. **Performance Optimization**
   - Implement image caching
   - Test concurrent rendering
   - Benchmark vs. MoviePy

4. **Cloud Deployment**
   - Set up AWS Lambda rendering
   - Implement batch processing queue

## References

- Remotion Docs: https://www.remotion.dev/docs/
- Server-Side Rendering: https://www.remotion.dev/docs/ssr
- API Reference: https://www.remotion.dev/docs/renderer
