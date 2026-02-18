#!/usr/bin/env python3
"""
Semantic Image Search Pipeline: Text → Summary → Keywords → Bing Search → Download

This script combines:
1. Ollama LLM for text summarization
2. Keyword extraction from summary
3. Bing image search
4. Image download

Usage:
    python scripts/semantic-image-search.py
    python scripts/semantic-image-search.py --words 15 --limit 5
"""

import argparse
import sys
import requests
import json
from pathlib import Path

try:
    from bing_image_downloader import downloader
except ImportError:
    print("Error: bing-image-downloader not installed")
    print("Install it with: pip install bing-image-downloader")
    sys.exit(1)


def summarize_with_ollama(text: str, ollama_url: str = "http://172.18.96.1:11434", 
                          model: str = "deepseek-r1:8b", target_words: int = 15) -> str:
    """
    Summarize text using Ollama LLM.
    
    Args:
        text: Input text to summarize
        ollama_url: Ollama API URL
        model: Ollama model to use
        target_words: Target word count for summary
        
    Returns:
        Summary string
    """
    prompt = f"""Extract {target_words} words or less that describe the visual content for image search. 

RULES:
- ONLY use information explicitly stated in the text
- Do NOT add information, locations, or details not mentioned
- Focus on: people names, team names, events, objects, actions, places, times
- Prioritize concrete, visual terms
- Remove filler words
- Return just the keywords/terms, no explanations

Text: {text}

Visual search terms ({target_words} words max):"""
    
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False
    }
    
    try:
        response = requests.post(
            f"{ollama_url}/api/generate",
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=300  # Increased timeout to 5 minutes for longer text
        )
        response.raise_for_status()
        result = response.json()
        summary = result.get("response", "").strip()
        return summary
    except Exception as e:
        raise Exception(f"Ollama API error: {e}")


def extract_keywords_from_summary(summary: str, top_n: int = 3) -> list:
    """
    Extract individual keywords from summary text.
    
    Args:
        summary: Summary text from Ollama
        top_n: Number of top keywords/phrases to extract
        
    Returns:
        List of keywords
    """
    # Split by comma, semicolon, or "and"
    import re
    
    # Try to split by common separators
    keywords = re.split(r'[,;]|\\band\\b', summary)
    keywords = [kw.strip() for kw in keywords if kw.strip()]
    
    # Return top N, or use full summary if fewer keywords
    return keywords[:top_n] if len(keywords) >= top_n else keywords


def search_and_download_images(search_query: str, limit: int = 5, output_dir: str = "temp/semantic-search"):
    """
    Search Bing for images and download them.
    
    Args:
        search_query: Search query string
        limit: Number of images to download
        output_dir: Output directory for images
        
    Returns:
        Number of images downloaded
    """
    output_path = Path(output_dir)
    
    print(f"\n[*] Searching Bing for images")
    print(f"[*] Query: '{search_query}'")
    print(f"[*] Limit: {limit} images")
    print("-" * 60)
    
    try:
        # Download images using bing-image-downloader
        downloader.download(
            query=search_query,
            limit=limit,
            output_dir=str(output_path),
            adult_filter_off=True,
            force_replace=False,
            timeout=60,
            filter="photo",
            verbose=True
        )
        
        # Check results
        image_dir = output_path / search_query
        if image_dir.exists():
            image_files = list(image_dir.glob("Image_*.*"))
            print("-" * 60)
            print(f"\n[✓] Downloaded {len(image_files)} images")
            print(f"[✓] Images saved to: {image_dir.absolute()}")
            
            if image_files:
                print("\nDownloaded files:")
                for img_file in sorted(image_files):
                    file_size = img_file.stat().st_size / 1024
                    print(f"  - {img_file.name} ({file_size:.1f} KB)")
            
            return len(image_files)
        else:
            print("\n[!] Warning: No images were downloaded")
            return 0
            
    except Exception as e:
        print(f"\n[✗] Error during image search: {e}")
        raise


def main():
    """Main function for semantic image search pipeline."""
    parser = argparse.ArgumentParser(
        description="Semantic Image Search: Text → Summary → Keywords → Bing Search → Download"
    )
    parser.add_argument(
        "--words",
        type=int,
        default=15,
        help="Target word count for summary (default: 15)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Number of images to download (default: 5)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="temp/semantic-search",
        help="Output directory for images (default: temp/semantic-search)"
    )
    
    args = parser.parse_args()
    
    # Hardcoded test text
    text = "vâng. tối nay thì người hâm mộ việt nam sẽ tiếp tục hướng sự chú ý đến vòng chung kết u hai ba châu á. hai nghìn không trăm hai mươi sáu, với trận tranh đấu hạng ba giữa đội tuyển u hai ba việt nam và u hai ba hàn quốc. có quá nhiều thử thách đang chờ đợi. để chờ huấn luyện viên kim sang xích về công anh phong vâng có thể nói rằng là u hai ba việt nam đã bị ngã một cú rất đau tại bán kết rồi ạ, trận thua không ba, thì giáng một đòn rất mạnh vào tinh thần của chúng ta. còn những chấn thương mà thẻ đỏ th giáng thêm một đòn nữa vào lực lượng của u hai ba việt nam. thế nhưng tôi nghĩ rằng là bỏ cuộc, là từ không bao giờ. có trong từ điển của u hai ba việt nam cả, và tối nay sẽ là thời điểm chúng ta cho u hai ba hàn quốc thấy rằng người việt nam kiên cường đến thế nào. huấn luyện viên kim san xích đã có những chia sẻ ngắn gọn và động viên các cầu thủ sau phần trao đổi của ban huấn luyện. u hai ba việt nam được chia thành hai nhóm để tập luyện và các cầu thủ đã thể hiện tinh thần chuyên nghiệp khi bước vào buổi tập. với sự tập trung và tinh thần quyết tâm cao độ ở trận đấu tới. nhiều khả năng huấn luyện viên kim sang xích sẽ để nhiều cầu thủ dự bị có cơ hội vào sân thể hiện. về mặt lực lượng, u hai ba việt nam gặp tổn thất lớn khi cả hai trung vệ trụ cột là hiểu minh và lý đức, không thể thi đấu vì những lý do khác nhau. trận đấu tranh hạng ba giữa u hai ba hàn quốc và u hai ba việt nam sẽ diễn ra vào lúc hai mươi hai giờ hôm nay và sẽ được tường thuật trực tiếp trên các kênh vtv hai, vtv cần thơ và ứng dụng vtv go. một ngày sau, cũng trên các kênh này, là trận chung kết giữa u hai ba trung quốc và u hai ba nhật bản. kính mời quý vị khán giả chú ý đón xem"
    print("\n" + "=" * 60)
    print("SEMANTIC IMAGE SEARCH PIPELINE")
    print("=" * 60)
    
    # Step 1: Summarize text
    print(f"\n[STEP 1] Summarizing text with Ollama (deepseek-r1:8b)")
    print(f"[*] Target: ~{args.words} words")
    print("-" * 60)
    
    try:
        summary = summarize_with_ollama(text, target_words=args.words)
        word_count = len(summary.split())
        
        print(f"\n[✓] Summary generated ({word_count} words):")
        print(f"    {summary}\n")
        
    except Exception as e:
        print(f"\n[✗] Summarization failed: {e}")
        sys.exit(1)
    
    # Step 2: Use full summary as search query
    print(f"\n[STEP 2] Preparing search query")
    print("-" * 60)
    
    search_query = f"{summary} latest, up to date information"
    print(f"\n[✓] Search query prepared ({word_count} words):")
    print(f"    {search_query}")
    
    # Step 3: Search images with full summary
    print(f"\n[STEP 3] Searching images on Bing")
    
    try:
        images_downloaded = search_and_download_images(
            search_query=search_query,
            limit=args.limit,
            output_dir=args.output_dir
        )
        
        print("\n" + "=" * 60)
        print("PIPELINE COMPLETED SUCCESSFULLY")
        print("=" * 60)
        print(f"\n[✓] Text summarized to: {word_count} words")
        print(f"[✓] Images downloaded: {images_downloaded} images")
        print(f"[✓] Search query used: '{search_query}'")
        print("\n")
        
    except Exception as e:
        print(f"\n[✗] Image search failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
