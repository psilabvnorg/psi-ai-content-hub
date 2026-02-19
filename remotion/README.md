# Content-2-Videos

Remotion project that generates videos from content folders.

## Quick Start

```bash
npm install
npx remotion studio
```
or
```bash
npm run dev
```
--
"orientation": "vertical",
horizontal
---

## Folder Structure

Each video lives in `public/main/video_X/`:

```
public/main/video_4/
  audio/
    xxx.mp3          # Narration audio (any name)
    xxx.json         # Captions (must match audio filename)
  image/
    01.jpg           # Slideshow images (sorted alphabetically)
    02.jpg
    Intro.jpg        # Intro background image
  config/
    video-config.json
    intro-config.json
```

## Configuration

### video-config.json

Controls video timing and layout mode.

```json
{
  "backgroundMode": false,
  "introDurationInFrames": 150,
  "imageDurationInFrames": 170
}
```

| Field | Description |
|-------|-------------|
| `backgroundMode` | `false` = intro plays then disappears. `true` = intro stays as overlay, images play behind |
| `introDurationInFrames` | Intro duration in frames (30fps, so 150 = 5 sec). Only used when `backgroundMode` is `false` |
| `imageDurationInFrames` | How long each slideshow image displays (in frames) |

### intro-config.json

Controls the intro overlay appearance: title, brand, colors, layout positions, template, etc.

```json
{
  "templateId": "template_1",
  "title": "Your video title",
  "brandName": "BRAND",
  "tagline": "Your tagline",
  "url": "https://example.com",
  "backgroundImage": "main/video_4/image/Intro.jpg",
  ...
}
```

Key fields:
- `templateId` - Which template to use (`template_1`, `template_2`). Loads logos, icons, music from `public/templates/{id}/`
- `backgroundImage` - Relative path from `public/` folder
- Position/size fields (`titleX`, `titleY`, `titleSize`, etc.) - Use Remotion Studio UI to preview and adjust

## Templates

Shared brand assets in `public/templates/template_X/`:

```
templates/template_1/
  logo/          # Brand logos
  icons/         # Social media icons
  elements/      # Decorative images
  sound/         # Background music (loops automatically)
  tiktok_background.png  # Pattern overlay
```

## Creating a New Video

1. Create folder `public/main/video_N/`
2. Add `audio/`, `image/`, `config/` subfolders
3. Drop in your audio (`.mp3`/`.wav`) + matching caption `.json`
4. Drop in slideshow images
5. Copy and edit `config/video-config.json` and `config/intro-config.json`
6. Update `contentDirectory` in `src/Root.tsx` to `"main/video_N"`
