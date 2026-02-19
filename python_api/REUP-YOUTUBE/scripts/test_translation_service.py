#!/usr/bin/env python3
"""
Test script for TranslationService.

Tests Vietnamese to English translation using the Tencent HY-MT model.
Input: Vietnamese news text about security drill
Output: English translation
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from multilingual_video_pipeline.services.translation import TranslationService
from multilingual_video_pipeline.models import Transcript, TranscriptSegment, TranscriptionModel


def main():
    """Test translation from Vietnamese to English."""
    
    # Vietnamese text to translate
    vietnamese_text = (
        "Sáng 10/1, tại đường Lê Quang Đạo, Bộ Công an tổ chức lễ xuất quân và diễn tập "
        "bảo đảm an ninh, trật tự phục vụ Đại hội đại biểu toàn quốc lần thứ 14 của Đảng"
    )
    
    print("=" * 80)
    print("TRANSLATION SERVICE TEST")
    print("=" * 80)
    
    print(f"\n📝 Input (Vietnamese):")
    print(f"   {vietnamese_text}")
    
    # Create transcript from Vietnamese text
    segment = TranscriptSegment(
        text=vietnamese_text,
        start_time=0.0,
        end_time=10.0,  # Approximate duration
        confidence=0.95
    )
    
    transcript = Transcript(
        segments=[segment],
        language='vi',
        full_text=vietnamese_text,
        transcription_model=TranscriptionModel.PHOWHISPER,
        model_confidence=0.95
    )
    
    print(f"\n📊 Transcript Info:")
    print(f"   Language: {transcript.language}")
    print(f"   Segments: {len(transcript.segments)}")
    print(f"   Duration: {segment.duration}s")
    
    try:
        print(f"\n🔄 Initializing TranslationService...")
        service = TranslationService()
        print(f"   ✅ Service initialized")
        
        print(f"\n🔄 Loading translation model...")
        service._load_model()
        print(f"   ✅ Model loaded on device: {service._current_device}")
        
        print(f"\n🔄 Translating Vietnamese → English...")
        translated_script = service.translate_script(
            transcript=transcript,
            target_language='en',
            preserve_emotion=True,
            adjust_for_narration=True
        )
        
        print(f"\n✅ Translation completed!")
        
        print(f"\n📝 Output (English):")
        for i, seg in enumerate(translated_script.translated_segments):
            print(f"   Segment {i+1}: {seg.text}")
        
        print(f"\n📊 Translation Quality:")
        print(f"   Duration Ratio: {translated_script.duration_ratio:.2f}")
        print(f"   (1.0 = same length, <1.0 = shorter, >1.0 = longer)")
        
        # Assess quality
        quality = service.assess_quality(translated_script)
        print(f"\n📈 Quality Metrics:")
        print(f"   Overall Score: {quality.score:.2f}/1.0")
        print(f"   Fluency: {quality.fluency:.2f}")
        print(f"   Accuracy: {quality.accuracy:.2f}")
        print(f"   Naturalness: {quality.naturalness:.2f}")
        print(f"   Quality Acceptable: {'✅ Yes' if quality.is_acceptable else '❌ No'}")
        
        if quality.flags:
            print(f"\n⚠️  Quality Flags:")
            for flag in quality.flags:
                print(f"   - {flag}")
        
        print(f"\n" + "=" * 80)
        print("TEST COMPLETED SUCCESSFULLY")
        print("=" * 80)
        
        return True
        
    except Exception as e:
        print(f"\n❌ Translation test failed:")
        print(f"   Error: {str(e)}")
        print(f"\nTroubleshooting:")
        print(f"   1. Ensure translation model is downloaded:")
        print(f"      pip install transformers torch accelerate auto-gptq")
        print(f"   2. Check model path in config.py (translation_model_path)")
        print(f"   3. Verify GPU/CUDA availability if needed")
        print(f"\n" + "=" * 80)
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
