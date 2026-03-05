import "./index.css";
import { Composition } from "remotion";
import { NewsIntroVertical, newsIntroVerticalSchema } from "./components/NewsIntroVertical";
import { NewsIntroHorizontal, newsIntroHorizontalSchema } from "./components/NewsIntroHorizontal";
import { NewsVerticalNoBackground, schema as schemaVNB, calculateMetadata as calcVNB } from "./news/NewsVerticalNoBackground";
import { NewsVerticalBackground, schema as schemaVB, calculateMetadata as calcVB } from "./news/NewsVerticalBackground";
import { NewsHorizontalNoBackground, schema as schemaHNB, calculateMetadata as calcHNB } from "./news/NewsHorizontalNoBackground";
import { NewsHorizontalBackground, schema as schemaHB, calculateMetadata as calcHB } from "./news/NewsHorizontalBackground";
import { MusicPlaylistVideo, musicPlaylistSchema } from "./music-playlist";
import { calculateMusicPlaylistMetadata } from "./music-playlist/calculateMainVideoMetadata";
import { MusicPlaylistVideo as PodcastVideo, musicPlaylistSchema as podcastSchema } from "./podcast";
import { calculateMusicPlaylistMetadata as calculatePodcastMetadata } from "./podcast/calculateMainVideoMetadata";

const NEWS_INTRO_DEFAULTS = {
  vertical: {
    image1: 'templates/news-intro-vertical/top.png',
    image2: 'templates/news-intro-vertical/bottom.png',
    heroImage: 'templates/news-intro-vertical/hero.png',
  },
  horizontal: {
    image1: 'templates/news-intro-horizontal/left.png',
    image2: 'templates/news-intro-horizontal/right.png',
    heroImage: 'templates/news-intro-horizontal/hero.png',
  },
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ── Standalone intro previews ── */}
      <Composition
        id="NewsIntroVertical"
        component={NewsIntroVertical}
        schema={newsIntroVerticalSchema}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={150}
        defaultProps={{
          topImage: 'templates/news-intro-vertical/top.png',
          bottomImage: 'templates/news-intro-vertical/bottom.png',
          heroImage: 'templates/news-intro-vertical/hero.png',
        }}
      />
      <Composition
        id="NewsIntroHorizontal"
        component={NewsIntroHorizontal}
        schema={newsIntroHorizontalSchema}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={150}
        defaultProps={{
          leftImage: 'templates/news-intro-horizontal/left.png',
          rightImage: 'templates/news-intro-horizontal/right.png',
          heroImage: 'templates/news-intro-horizontal/hero.png',
        }}
      />

      {/* ── News: Vertical + Background overlay ── */}
      <Composition
        id="NewsVerticalBackground"
        component={NewsVerticalBackground}
        calculateMetadata={calcVB}
        schema={schemaVB}
        defaultProps={{
          contentDirectory: 'main/preview',
          introProps: NEWS_INTRO_DEFAULTS.vertical,
          images: [], videos: [], videoDurations: [], captions: [], sections: [],
          introDurationInFrames: 150,
          imageDurationInFrames: 170,
        }}
      />

      {/* ── News: Vertical + Full intro ── */}
      <Composition
        id="NewsVerticalNoBackground"
        component={NewsVerticalNoBackground}
        calculateMetadata={calcVNB}
        schema={schemaVNB}
        defaultProps={{
          contentDirectory: 'main/preview',
          introProps: NEWS_INTRO_DEFAULTS.vertical,
          images: [], videos: [], videoDurations: [], captions: [], sections: [],
          introDurationInFrames: 150,
          imageDurationInFrames: 170,
        }}
      />

      {/* ── News: Horizontal + Background overlay ── */}
      <Composition
        id="NewsHorizontalBackground"
        component={NewsHorizontalBackground}
        calculateMetadata={calcHB}
        schema={schemaHB}
        defaultProps={{
          contentDirectory: 'main/preview',
          introProps: NEWS_INTRO_DEFAULTS.horizontal,
          images: [], videos: [], videoDurations: [], captions: [], sections: [],
          introDurationInFrames: 150,
          imageDurationInFrames: 170,
        }}
      />

      {/* ── News: Horizontal + Full intro ── */}
      <Composition
        id="NewsHorizontalNoBackground"
        component={NewsHorizontalNoBackground}
        calculateMetadata={calcHNB}
        schema={schemaHNB}
        defaultProps={{
          contentDirectory: 'main/preview',
          introProps: NEWS_INTRO_DEFAULTS.horizontal,
          images: [], videos: [], videoDurations: [], captions: [], sections: [],
          introDurationInFrames: 150,
          imageDurationInFrames: 170,
        }}
      />

      {/* ── Music Playlist ── */}
      <Composition
        id="MusicPlaylist"
        component={MusicPlaylistVideo}
        calculateMetadata={calculateMusicPlaylistMetadata}
        schema={musicPlaylistSchema}
        defaultProps={{
          contentDirectory: "main/music-playlist",
          orientation: "vertical",
          audioFiles: [],
          audioDurationsInFrames: [],
          images: [],
          imageDurationInFrames: 300,
          artistName: "Son Tung M-TP",
          accentColor: "#A855F7",
          waveformStyle: "bars",
          numberOfBars: 64,
          title: "",
          heroImage: "",
          textBackgroundColor: "#000000",
          textBackgroundOpacity: 0.45,
        }}
      />

      {/* ── Podcast ── */}
      <Composition
        id="Podcast"
        component={PodcastVideo}
        calculateMetadata={calculatePodcastMetadata}
        schema={podcastSchema}
        defaultProps={{
          contentDirectory: "main/podcast",
          orientation: "vertical",
          audioFiles: [],
          audioDurationsInFrames: [],
          images: [],
          imageDurationInFrames: 300,
          artistName: "",
          accentColor: "#A855F7",
          waveformStyle: "bars",
          numberOfBars: 64,
          title: "",
          heroImage: "",
          textBackgroundColor: "#000000",
          textBackgroundOpacity: 0.45,
          trackCaptions: [],
        }}
      />
    </>
  );
};
