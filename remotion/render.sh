#!/bin/bash

# Usage: ./render.sh <video_folder> [template_id] [output_file]
# Example: ./render.sh video_1 template_1 output.mp4
# Example: ./render.sh 986567a8a3aa4ebf0732dad10e5f8b82cf4d682c9de2ad428b76419000ec1781 template_2 my-video.mp4

VIDEO_FOLDER=${1:-video_1}
TEMPLATE_ID=${2:-template_1}
OUTPUT_FILE=${3:-out.mp4}

# Handle both relative folder names and full paths
if [[ "$VIDEO_FOLDER" == /* ]]; then
  # Absolute path - extract the relative path from public/main/
  CONTENT_DIR=$(echo "$VIDEO_FOLDER" | sed 's|.*/public/||')
  # Output to the same folder
  OUTPUT_PATH="${VIDEO_FOLDER}/${OUTPUT_FILE}"
else
  # Relative folder name - prepend main/
  CONTENT_DIR="main/${VIDEO_FOLDER}"
  # Output to public/main/<folder>/
  OUTPUT_PATH="public/${CONTENT_DIR}/${OUTPUT_FILE}"
fi

echo "Rendering with:"
echo "  Content Directory: ${CONTENT_DIR}"
echo "  Template: ${TEMPLATE_ID}"
echo "  Output: ${OUTPUT_PATH}"

# Create temporary props file
cat > /tmp/render-props.json << EOF
{
  "contentDirectory": "${CONTENT_DIR}",
  "introProps": {
    "templateId": "${TEMPLATE_ID}",
    "title": "Loạt cổ phiếu ngân hàng, chứng khoán tăng trần",
    "brandName": "PSI.VN",
    "tagline": "KÊNH KINH TẾ - CHÍNH TRỊ - XÃ HỘI",
    "url": "https://psi.vn",
    "backgroundImage": "${CONTENT_DIR}/Intro.jpg",
    "gradientTopColor": "rgba(10, 10, 26, 0.7)",
    "gradientBottomColor": "rgba(0, 0, 0, 0.85)",
    "gradientOpacity": 1,
    "showBackgroundPattern": true,
    "backgroundPatternOpacity": 1,
    "showTopLogo": true,
    "topLogoX": 960,
    "topLogoY": 30,
    "topLogoSize": 80,
    "showBrandLogo": true,
    "brandSectionX": 80,
    "brandSectionY": 1080,
    "brandLogoSize": 100,
    "brandNameSize": 120,
    "brandNameColor": "#ffffff",
    "accentColor": "#ffffff",
    "taglineX": 80,
    "taglineY": 1230,
    "taglineSize": 28,
    "taglineColor": "#ffffff",
    "titleX": 80,
    "titleY": 1390,
    "titleSize": 64,
    "titleColor": "#ffffff",
    "showSocialIcons": true,
    "socialSectionX": 40,
    "socialSectionY": 1830,
    "socialIconSize": 45,
    "showFacebook": true,
    "showTikTok": true,
    "showYouTube": true,
    "showInstagram": true,
    "urlX": 0,
    "urlSize": 32,
    "urlColor": "#ffffff",
    "showMoneyElement": true,
    "moneyElementX": 140,
    "moneyElementY": 1260,
    "moneyElementSize": 400,
    "moneyElementOpacity": 0.1,
    "showProfitElement": true,
    "profitElementX": 410,
    "profitElementY": 1430,
    "profitElementSize": 710,
    "profitElementOpacity": 0.2,
    "enableAudio": false,
    "audioVolume": 0.3,
    "animationSpeed": 1
  },
  "images": [],
  "videos": [],
  "videoDurations": [],
  "introDurationInFrames": 150,
  "imageDurationInFrames": 170
}
EOF

npx remotion render MainVideo "${OUTPUT_PATH}" --props=/tmp/render-props.json
