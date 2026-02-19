import "./index.css";
import { Composition, staticFile } from "remotion";
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
      <Composition
        id="News"
        component={News}
        calculateMetadata={calculateMainVideoMetadata}
        schema={mainVideoSchema}
        defaultProps={{
          contentDirectory: "main/news",
          orientation: "vertical",
          introProps: {
            templateId: "template_1",
            title: "Loạt cổ phiếu ngân hàng, chứng khoán tăng trần",
            brandName: "PSI.VN",
            tagline: "KÊNH KINH TẾ - CHÍNH TRỊ - XÃ HỘI",
            url: "https://psi.vn",
            backgroundImage: staticFile("main/news/image/Intro.jpg"),
            gradientTopColor: "rgba(10, 10, 26, 0.7)",
            gradientBottomColor: "rgba(0, 0, 0, 0.85)",
            gradientOpacity: 1,
            showBackgroundPattern: true,
            backgroundPatternOpacity: 0.7,
            showTopLogo: true,
            topLogoX: 960,
            topLogoY: 30,
            topLogoSize: 80,
            showBrandLogo: true,
            brandSectionX: 80,
            brandSectionY: 1080,
            brandLogoSize: 100,
            brandNameSize: 120,
            brandNameColor: "#ffffff",
            accentColor: "#ffffff",
            taglineX: 80,
            taglineY: 1230,
            taglineSize: 28,
            taglineColor: "#ffffff",
            titleX: 80,
            titleY: 1390,
            titleSize: 64,
            titleColor: "#ffffff",
            showSocialIcons: true,
            socialSectionX: 40,
            socialSectionY: 1830,
            socialIconSize: 45,
            showFacebook: true,
            showTikTok: true,
            showYouTube: true,
            showInstagram: true,
            urlX: 0,
            urlSize: 32,
            urlColor: "#ffffff",
            showMoneyElement: true,
            moneyElementX: 140,
            moneyElementY: 1260,
            moneyElementSize: 400,
            moneyElementOpacity: 0.1,
            showProfitElement: true,
            profitElementX: 410,
            profitElementY: 1430,
            profitElementSize: 710,
            profitElementOpacity: 0.2,
            enableAudio: false,
            audioVolume: 0.3,
            animationSpeed: 1,
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
            templateId: "template_2",
            title: "Timeline of World War II",
            brandName: "PSI.VN",
            tagline: "KÊNH GIÁO DỤC - LỊCH SỬ",
            url: "https://psi.vn",
            backgroundImage: staticFile("main/news/image/Intro.jpg"),
            gradientTopColor: "rgba(10, 10, 26, 0.7)",
            gradientBottomColor: "rgba(0, 0, 0, 0.85)",
            gradientOpacity: 1,
            showBackgroundPattern: true,
            backgroundPatternOpacity: 0.7,
            showTopLogo: true,
            topLogoX: 960,
            topLogoY: 30,
            topLogoSize: 80,
            showBrandLogo: true,
            brandSectionX: 80,
            brandSectionY: 1080,
            brandLogoSize: 100,
            brandNameSize: 120,
            brandNameColor: "#ffffff",
            accentColor: "#ffffff",
            taglineX: 80,
            taglineY: 1230,
            taglineSize: 28,
            taglineColor: "#ffffff",
            titleX: 80,
            titleY: 1390,
            titleSize: 64,
            titleColor: "#ffffff",
            showSocialIcons: true,
            socialSectionX: 40,
            socialSectionY: 1830,
            socialIconSize: 45,
            showFacebook: true,
            showTikTok: true,
            showYouTube: true,
            showInstagram: true,
            urlX: 0,
            urlSize: 32,
            urlColor: "#ffffff",
            showMoneyElement: true,
            moneyElementX: 140,
            moneyElementY: 1260,
            moneyElementSize: 400,
            moneyElementOpacity: 0.1,
            showProfitElement: true,
            profitElementX: 410,
            profitElementY: 1430,
            profitElementSize: 710,
            profitElementOpacity: 0.2,
            enableAudio: false,
            audioVolume: 0.3,
            animationSpeed: 1,
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
