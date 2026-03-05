import "./index.css";
import { Composition } from "remotion";
import { NewsIntroVertical, newsIntroVerticalSchema } from "./components/NewsIntroVertical";
import { NewsIntroHorizontal, newsIntroHorizontalSchema } from "./components/NewsIntroHorizontal";
import { News, mainVideoSchema } from "./news";
import { calculateMainVideoMetadata } from "./news/calculateMainVideoMetadata";
import { Education, mainVideoSchema as educationSchema } from "./education";
import { calculateMainVideoMetadata as calculateEducationMetadata } from "./education/calculateMainVideoMetadata";
import { MusicPlaylistVideo, musicPlaylistSchema } from "./music-playlist";
import { calculateMusicPlaylistMetadata } from "./music-playlist/calculateMainVideoMetadata";
import { MusicPlaylistVideo as PodcastVideo, musicPlaylistSchema as podcastSchema } from "./podcast";
import { calculateMusicPlaylistMetadata as calculatePodcastMetadata } from "./podcast/calculateMainVideoMetadata";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ── NewsIntroHorizontal ── */}
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

      {/* ── NewsIntroVertical ── */}
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
        id="News"
        component={News}
        calculateMetadata={calculateMainVideoMetadata}
        schema={mainVideoSchema}
        defaultProps={{
          contentDirectory: "main/preview",
          orientation: "vertical",
          introProps: {
            image1: 'templates/news-intro-vertical/top.png',
            image2: 'templates/news-intro-vertical/bottom.png',
            heroImage: 'templates/news-intro-vertical/hero.png',
          },
          images: [],
          videos: [],
          videoDurations: [],
          captions: [],
          backgroundMode: false,
          introDurationInFrames: 150,
          imageDurationInFrames: 170,
        }}
      />

      {/* ── Education ── */}
      <Composition
        id="Education"
        component={Education}
        calculateMetadata={calculateEducationMetadata}
        schema={educationSchema}
        defaultProps={{
          contentDirectory: "main/education",
          orientation: "vertical",
          introProps: {
            image1: 'templates/news-intro-vertical/top.png',
            image2: 'templates/news-intro-vertical/bottom.png',
            heroImage: 'templates/news-intro-vertical/hero.png',
          },
          images: [],
          videos: [],
          videoDurations: [],
          captions: [],
          sections: [],
          backgroundMode: false,
          introDurationInFrames: 150,
          imageDurationInFrames: 170,
        }}
      />

      {/* ── Music Playlist: TikTok  ── */}
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
