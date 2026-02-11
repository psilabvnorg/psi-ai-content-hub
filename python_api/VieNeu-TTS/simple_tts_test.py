"""
Simple script to test VieNeu TTS generation.
This script generates speech from Vietnamese text using a preset voice.
"""
import os
import sys
from pathlib import Path

# Set HuggingFace cache to our custom location BEFORE importing any HF libraries
MODELS_ROOT = Path(os.environ.get("APPDATA", str(Path.home() / ".config"))) / "psi-ai-content-hub" / "models"
HF_CACHE_DIR = MODELS_ROOT / "huggingface_cache"
HF_CACHE_DIR.mkdir(parents=True, exist_ok=True)

os.environ["HF_HOME"] = str(HF_CACHE_DIR)
os.environ["HUGGINGFACE_HUB_CACHE"] = str(HF_CACHE_DIR)
os.environ["TRANSFORMERS_CACHE"] = str(HF_CACHE_DIR)

# Add VieNeu-TTS to path
vieneu_dir = Path(__file__).parent
if str(vieneu_dir) not in sys.path:
    sys.path.insert(0, str(vieneu_dir))

from vieneu import VieNeuTTS
import soundfile as sf

# Configuration
MODEL_DIR = MODELS_ROOT / "vieneu-tts"
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Codec repository
CODEC_REPO = "neuphonic/distill-neucodec"

# Text to synthesize
TEXT = "Con dâu tung tiếp clip bị mẹ chồng chửi rủa, cộng đồng mạng không bỏ quên anh chồng"

# Reference text
REF_TEXT = "Tôi là một trợ lý ảo có thể nói tiếng Việt."

def main():
    print("=" * 60)
    print("VieNeu TTS Simple Test")
    print("=" * 60)
    
    # Check if model exists
    if not MODEL_DIR.exists():
        print(f"\n❌ Model directory not found: {MODEL_DIR}")
        print("Please ensure the model is downloaded to the correct location.")
        return
    
    print(f"\n📁 Model directory: {MODEL_DIR}")
    print(f"📁 HuggingFace cache: {HF_CACHE_DIR}")
    
    # Find reference audio - try multiple locations
    ref_audio_candidates = [
        vieneu_dir / "vieneu-tts-sample" / "voice" / "Bình (nam miền Bắc).wav",
        vieneu_dir / "vieneu" / "assets" / "samples" / "Bình (nam miền Bắc).wav",
        vieneu_dir / "vieneu-tts-sample" / "voice" / "Ly (nữ miền Bắc).wav",
        vieneu_dir / "vieneu" / "assets" / "samples" / "Ly (nữ miền Bắc).wav",
    ]
    
    ref_audio = None
    for candidate in ref_audio_candidates:
        if candidate.exists():
            ref_audio = candidate
            break
    
    if ref_audio is None:
        print(f"\n❌ No reference audio found. Tried:")
        for candidate in ref_audio_candidates:
            print(f"   - {candidate}")
        return
    
    print(f"🎤 Reference audio: {ref_audio}")
    print(f"📝 Text to synthesize: {TEXT}")
    
    try:
        print("\n⏳ Loading VieNeu TTS model...")
        
        # Initialize TTS engine - codec will be downloaded automatically to HuggingFace cache
        # but we'll track it for reference
        print(f"⏳ Codec will be cached by HuggingFace (repo: {CODEC_REPO})")
        print(f"⏳ Loading backbone from {MODEL_DIR}...")
        
        tts = VieNeuTTS(
            backbone_repo=str(MODEL_DIR),
            backbone_device="cuda",  # Use "cpu" if no GPU
            codec_repo=CODEC_REPO,
            codec_device="cpu"
        )
        
        print("✅ Model loaded successfully!")
        
        print("\n⏳ Encoding reference audio...")
        # Encode reference audio
        ref_codes = tts.encode_reference(str(ref_audio))
        print("✅ Reference encoded!")
        
        print("\n⏳ Generating speech...")
        # Generate speech
        audio = tts.infer(
            text=TEXT,
            ref_codes=ref_codes,
            ref_text=REF_TEXT
        )
        
        print("✅ Speech generated!")
        
        # Save output
        output_file = OUTPUT_DIR / "test_output.wav"
        sf.write(str(output_file), audio, 24000)
        
        print(f"\n✅ Audio saved to: {output_file}")
        print(f"📊 Audio length: {len(audio) / 24000:.2f} seconds")
        print("\n" + "=" * 60)
        print("✅ Test completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
