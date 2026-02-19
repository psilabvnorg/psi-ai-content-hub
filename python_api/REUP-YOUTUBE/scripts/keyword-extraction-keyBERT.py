#!/usr/bin/env python3
"""
Test script for Ollama-based keyword extraction.

This script uses Ollama LLM to summarize text and extract meaningful keywords.
Keywords are ranked by relevance and can be used for image search queries.

Usage:
    python scripts/keyword-extraction-keyBERT.py
"""

import argparse
import sys
import requests
import json


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
            timeout=60
        )
        response.raise_for_status()
        result = response.json()
        summary = result.get("response", "").strip()
        return summary
    except Exception as e:
        raise Exception(f"Ollama API error: {e}")


def extract_keywords_from_text(target_words: int = 15) -> str:
    """
    Extract keywords by summarizing text with Ollama.
    
    Args:
        target_words: Target word count for summary
        
    Returns:
        Summary string suitable for image search
    """
    # Hardcoded text to test
    text = "Yes. Tonight, the Vietnamese fans will continue to focus their attention on the final round of U-23 Asian Championships. It's a match between the Vietnamese U-23 team and the Korean U-23 team. There are many challenges ahead. With Coach Kim Sang-xich leading the team, it can be said that the Vietnamese team suffered a very painful defeat in the semi-finals. That loss dealt a heavy blow to our morale. And those injuries added another challenge to the Vietnamese team's strength. But I believe that giving up is never an option. In the dictionary of U-2BA, there's also tonight – it will be the moment when we show U-2BA Korea how strong the Vietnamese team really is. Coach Kim San Xich gave some brief speeches and encouraged the players after the coaching session. U-2BA Vietnam was divided into two groups for training, and the players showed professional spirit during the training session. With their high level of concentration and determination, they are ready for the upcoming match. It's likely that Coach Kim San Xich will give more reserve players a chance to play in this match. In terms of player availability, U Hai Ba Viet Nam suffered significant losses as both their key defenders, Hiểu Minh and Lý Đức, were unable to play due to various reasons. The match between U Hai Ba Viet Nam and U Hai Ba Hàn Quốc will take place at 22:00 today, and it will be broadcast live on VTV 2, VTV Can Tho, and VTV Go apps. One day later, on these same channels, there will be a final match between U Hai Ba Trung Quốc and U Hai Ba Nhật Bản. We kindly request all viewers to tune in to watch this match."
    
    # Call Ollama to summarize
    summary = summarize_with_ollama(text, target_words=target_words)
    return summary


def main():
    """
    Extract keywords from text using KeyBERT.
    
    Args:
        top_n: Number of keywords to extract (default: 5)
        ngram_range: Range of n-grams (default: (1, 3) for 1-3 word phrases)
        
    Returns:
        List of tuples (keyword, score)
    """
    # Initialize KeyBERT with a lightweight model
    kw_model = KeyBERT(model='paraphrase-multilingual-MiniLM-L12-v2')

    text = "Yes. Tonight, the Vietnamese fans will continue to focus their attention on the final round of U-23 Asian Championships. It’s a match between the Vietnamese U-23 team and the Korean U-23 team. There are many challenges ahead. With Coach Kim Sang-xich leading the team, it can be said that the Vietnamese team suffered a very painful defeat in the semi-finals. That loss dealt a heavy blow to our morale. And those injuries added another challenge to the Vietnamese team’s strength. But I believe that giving up is never an option. In the dictionary of U-2BA, there’s also tonight – it will be the moment when we show U-2BA Korea how strong the Vietnamese team really is. Coach Kim San Xich gave some brief speeches and encouraged the players after the coaching session. U-2BA Vietnam was divided into two groups for training, and the players showed professional spirit during the training session. With their high level of concentration and determination, they are ready for the upcoming match. It’s likely that Coach Kim San Xich will give more reserve players a chance to play in this match. In terms of player availability, U Hai Ba Viet Nam suffered significant losses as both their key defenders, Hiểu Minh and Lý Đức, were unable to play due to various reasons. The match between U Hai Ba Viet Nam and U Hai Ba Hàn Quốc will take place at 22:00 today, and it will be broadcast live on VTV 2, VTV Can Tho, and VTV Go apps. One day later, on these same channels, there will be a final match between U Hai Ba Trung Quốc and U Hai Ba Nhật Bản. We kindly request all viewers to tune in to watch this match."
    
    # Extract keywords with scores
    keywords = kw_model.extract_keywords(
        text,
        keyphrase_ngram_range=ngram_range,
        stop_words='english',
        top_n=top_n,
        use_maxsum=True,  # Use Max Sum Distance for diversity
        nr_candidates=20   # Consider more candidates for better results
    )
    
    return keywords


def main():
    """Main function to extract and display summary."""
    parser = argparse.ArgumentParser(
        description="Extract keywords by summarizing text with Ollama LLM"
    )
    parser.add_argument(
        "--words",
        type=int,
        default=15,
        help="Target word count for summary (default: 15)"
    )
    
    args = parser.parse_args()
    
    print(f"\n[*] Summarizing text with Ollama (deepseek-r1:8b)")
    print(f"[*] Target: ~{args.words} words")
    print("-" * 60)
    
    try:
        # Generate summary
        summary = extract_keywords_from_text(target_words=args.words)
        
        # Count actual words
        word_count = len(summary.split())
        
        print(f"\n[✓] Summary generated ({word_count} words):\n")
        print(f"  {summary}")
        
        print(f"\n[*] Image search query:")
        print(f"  '{summary}'")
        
    except Exception as e:
        print(f"\n[✗] Error during summarization: {e}")
        sys.exit(1)
    
    print("\n[*] Extraction completed!")


if __name__ == "__main__":
    main()
