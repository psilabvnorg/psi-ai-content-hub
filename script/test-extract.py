import json
import re


def clean_for_tts(text: str) -> str:
    """Clean text for TTS: keep only words, commas, dots, slashes, and spaces."""
    # Remove content in brackets like [1], [2], etc.
    text = re.sub(r"\[.*?\]", "", text)
    # Remove content in parentheses like (áo trắng)
    text = re.sub(r"\(.*?\)", "", text)
    # Remove quotes
    text = re.sub(r'["""\'\'«»]', "", text)
    # Keep only letters (Vietnamese included), digits, commas, dots, colons, semicolons, slashes, hyphens, spaces
    text = re.sub(r"[^\w\s,.\-/:;]", "", text, flags=re.UNICODE)
    # Collapse multiple spaces
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


path = r"C:\Users\ADMIN\AppData\Local\Temp\psi_ai_content_hub\news_scraper\article_1.json"

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

paragraphs = data["body"]["paragraphs"]

print("=== Cleaned for TTS ===\n")
for p in paragraphs:
    cleaned = clean_for_tts(p)
    print(cleaned)
    print()