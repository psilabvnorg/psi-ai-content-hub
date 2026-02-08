#!/usr/bin/env python3
"""
PhoWhisper Transcription Module
Part of VidLipSyncVoice Pipeline - Step 2

Transcribes Vietnamese speech from audio with word-level timestamps for accurate synchronization.
"""

import argparse
import json
from pathlib import Path
import sys
import warnings
warnings.filterwarnings("ignore")

# Try to import transformers for PhoWhisper, fallback to whisper
try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

try:
    from deepmultilingualpunctuation import PunctuationModel
    PUNCTUATION_AVAILABLE = True
except ImportError:
    PUNCTUATION_AVAILABLE = False

try:
    from deepmultilingualpunctuation import PunctuationModel
    PUNCTUATION_AVAILABLE = True
except ImportError:
    PUNCTUATION_AVAILABLE = False


def restore_punctuation(text, verbose=True):
    """
    Restore punctuation to text using deep learning model.
    Falls back to basic punctuation if model not available.
    
    Args:
        text: Text without punctuation
        verbose: Print progress
        
    Returns:
        str: Text with restored punctuation
    """
    if not text.strip():
        return text
    
    if PUNCTUATION_AVAILABLE:
        if verbose:
            print("Restoring punctuation with ML model...")
        try:
            model = PunctuationModel()
            return model.restore_punctuation(text)
        except Exception as e:
            if verbose:
                print(f"Warning: Punctuation model failed ({e}), using fallback")
    
    # Fallback: Basic rule-based punctuation for Vietnamese
    if verbose:
        print("Using basic punctuation rules (install deepmultilingualpunctuation for better results)")
    
    import re
    
    # Add comma after common Vietnamese conjunctions
    text = re.sub(r'\b(mà|nhưng|tuy nhiên|vì|nên|thì|và|hoặc|hay)\b\s+', r'\1, ', text)
    
    # Add period after common sentence-ending particles
    text = re.sub(r'\b(vậy|rồi|thôi|đấy|đó|ạ|nhé|nha|à)\b(\s+[A-ZĐƠƯĂÂÊÔ])', r'\1. \2', text)
    
    # Capitalize after periods
    text = re.sub(r'(\.\s+)([a-zđơưăâêô])', lambda m: m.group(1) + m.group(2).upper(), text)
    
    # Capitalize first letter
    if text:
        text = text[0].upper() + text[1:]
    
    # Ensure ends with period
    if text and text[-1] not in '.!?':
        text += '.'
    
    return text


def transcribe_with_timestamps(audio_path, model_name="base", language="vi", verbose=True, model_path=None, add_punctuation=True):
    """
    Transcribe audio with word-level timestamps.
    
    Args:
        audio_path: Path to audio file
        model_name: Whisper model size (tiny, base, small, medium, large) or HuggingFace model name
        language: Language code (default: "vi" for Vietnamese)
        verbose: Print progress information
        model_path: Path to local model directory (for PhoWhisper or custom models)
        add_punctuation: Restore punctuation for better TTS quality (default: True)
    
    Returns:
        dict: {
            'text': full transcription (with punctuation if enabled),
            'text_no_punctuation': original transcription without punctuation,
            'language': detected/specified language,
            'duration': audio duration,
            'segments': [{
                'id': segment id,
                'start': timestamp,
                'end': timestamp,
                'text': segment text,
                'words': word-level timestamps (if available)
            }],
            'punctuation_restored': whether punctuation was added
        }
    """
    
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    
    # Use PhoWhisper from transformers if model_path is provided
    if model_path:
        if not TRANSFORMERS_AVAILABLE:
            raise ImportError("transformers library is required for PhoWhisper. Install with: pip install transformers")
        return _transcribe_with_transformers(audio_path, model_path, language, verbose, add_punctuation)
    
    # Otherwise use OpenAI Whisper
    if not WHISPER_AVAILABLE:
        raise ImportError("openai-whisper library is required. Install with: pip install openai-whisper")
    return _transcribe_with_whisper(audio_path, model_name, language, verbose, add_punctuation)


def _transcribe_with_transformers(audio_path, model_path, language, verbose, add_punctuation=True):
    """Transcribe using HuggingFace transformers (PhoWhisper)."""
    if verbose:
        print(f"Loading PhoWhisper model from: {model_path}")
        print(f"Audio file: {audio_path}")
    
    try:
        # Load PhoWhisper pipeline
        pipe = pipeline(
            "automatic-speech-recognition",
            model=model_path,
            chunk_length_s=30,
            return_timestamps="word"
        )
        if verbose:
            print(f"✓ Model loaded successfully")
    except Exception as e:
        print(f"Error loading model: {e}")
        sys.exit(1)
    
    if verbose:
        print(f"\nTranscribing audio (language: {language})...")
        print("This may take a few minutes depending on audio length...")
    
    try:
        result = pipe(str(audio_path), return_timestamps="word")
    except Exception as e:
        print(f"Error during transcription: {e}")
        sys.exit(1)
    
    # Extract information from transformers output
    original_text = result.get('text', '').strip()
    
    # Restore punctuation if requested
    if add_punctuation:
        full_text = restore_punctuation(original_text, verbose)
    else:
        full_text = original_text
    chunks = result.get('chunks', [])
    
    # Convert chunks to segments with word timestamps
    segments = []
    current_segment = {'id': 0, 'words': [], 'text': ''}
    segment_start = None
    
    for i, chunk in enumerate(chunks):
        timestamp = chunk.get('timestamp', (0.0, 0.0))
        text = chunk.get('text', '').strip()
        
        if timestamp[0] is not None:
            word_start = timestamp[0]
        else:
            word_start = segments[-1]['end'] if segments else 0.0
            
        if timestamp[1] is not None:
            word_end = timestamp[1]
        else:
            word_end = word_start + 0.5
        
        if segment_start is None:
            segment_start = word_start
        
        current_segment['words'].append({
            'word': text,
            'start': word_start,
            'end': word_end
        })
        current_segment['text'] += text + ' '
        
        # Create new segment every ~30 seconds or at sentence boundaries
        if (word_end - segment_start > 30) or (i == len(chunks) - 1):
            current_segment['start'] = segment_start
            current_segment['end'] = word_end
            current_segment['text'] = current_segment['text'].strip()
            segments.append(current_segment)
            
            # Start new segment
            current_segment = {'id': len(segments), 'words': [], 'text': ''}
            segment_start = None
    
    duration = segments[-1]['end'] if segments else 0
    
    if verbose:
        print(f"\n✓ Transcription completed")
        print(f"Language: {language}")
        print(f"Duration: {duration:.2f}s ({int(duration//60)}m {int(duration%60)}s)")
        print(f"Segments: {len(segments)}")
        print(f"Text length: {len(full_text)} characters")
    
    output = {
        'text': full_text,
        'text_no_punctuation': original_text,
        'language': language,
        'duration': duration,
        'segments': segments,
        'audio_path': str(audio_path),
        'punctuation_restored': add_punctuation,
    }
    
    if verbose:
        print(f"\n{'='*60}")
        print("Transcription Preview:")
        print(f"{'='*60}")
        preview_text = full_text[:500] + "..." if len(full_text) > 500 else full_text
        print(preview_text)
        print(f"{'='*60}\n")
    
    return output


def _transcribe_with_whisper(audio_path, model_name, language, verbose, add_punctuation=True):
    """Transcribe using OpenAI Whisper."""
    if verbose:
        print(f"Loading Whisper model: {model_name}")
        print(f"Audio file: {audio_path}")
    
    try:
        model = whisper.load_model(model_name)
        if verbose:
            print(f"✓ Model loaded successfully")
    except Exception as e:
        print(f"Error loading model: {e}")
        sys.exit(1)
    
    if verbose:
        print(f"\nTranscribing audio (language: {language})...")
        print("This may take a few minutes depending on audio length...")
    
    try:
        result = model.transcribe(
            str(audio_path),
            language=language,
            word_timestamps=True,
            verbose=verbose
        )
    except Exception as e:
        print(f"Error during transcription: {e}")
        sys.exit(1)
    
    # Extract information
    full_text = result.get('text', '').strip()
    detected_language = result.get('language', language)
    segments = result.get('segments', [])
    
    # Get audio duration from last segment
    duration = segments[-1]['end'] if segments else 0
    
    if verbose:
        print(f"\n✓ Transcription completed")
        print(f"Language: {detected_language}")
        print(f"Duration: {duration:.2f}s ({int(duration//60)}m {int(duration%60)}s)")
        print(f"Segments: {len(segments)}")
        print(f"Text length: {len(full_text)} characters")
    
    # Format output structure
    formatted_segments = []
    for seg in segments:
        segment_data = {
            'id': seg.get('id', 0),
            'start': seg.get('start', 0.0),
            'end': seg.get('end', 0.0),
            'text': seg.get('text', '').strip(),
        }
        
        # Add word-level timestamps if available
        if 'words' in seg and seg['words']:
            segment_data['words'] = [
                {
                    'word': word.get('word', '').strip(),
                    'start': word.get('start', 0.0),
                    'end': word.get('end', 0.0),
                }
                for word in seg['words']
            ]
        
        formatted_segments.append(segment_data)
    
    # Restore punctuation if requested
    original_text = full_text
    if add_punctuation:
        full_text = restore_punctuation(full_text, verbose)
    
    output = {
        'text': full_text,
        'text_no_punctuation': original_text,
        'language': detected_language,
        'duration': duration,
        'segments': formatted_segments,
        'audio_path': str(audio_path),
        'punctuation_restored': add_punctuation,
    }
    
    if verbose:
        print(f"\n{'='*60}")
        print("Transcription Preview:")
        print(f"{'='*60}")
        # Show first 500 characters
        preview_text = full_text[:500] + "..." if len(full_text) > 500 else full_text
        print(preview_text)
        print(f"{'='*60}\n")
    
    return output


def save_transcription(transcription, output_path, verbose=True):
    """
    Save transcription to JSON file.
    
    Args:
        transcription: Transcription dict from transcribe_with_timestamps
        output_path: Path to save JSON file
        verbose: Print progress information
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(transcription, f, ensure_ascii=False, indent=2)
    
    if verbose:
        print(f"✓ Transcription saved to: {output_path}")


def load_transcription(json_path):
    """
    Load transcription from JSON file.
    
    Args:
        json_path: Path to JSON file
        
    Returns:
        dict: Transcription data
    """
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def print_segments(transcription, max_segments=None):
    """
    Print transcription segments in a readable format.
    
    Args:
        transcription: Transcription dict
        max_segments: Maximum number of segments to print (None = all)
    """
    segments = transcription['segments']
    total = len(segments)
    
    if max_segments:
        segments = segments[:max_segments]
    
    print(f"\nSegments (showing {len(segments)} of {total}):")
    print("="*80)
    
    for seg in segments:
        start_time = seg['start']
        end_time = seg['end']
        text = seg['text']
        
        # Format time as MM:SS.mmm
        start_str = f"{int(start_time//60):02d}:{start_time%60:06.3f}"
        end_str = f"{int(end_time//60):02d}:{end_time%60:06.3f}"
        
        print(f"[{start_str} -> {end_str}] {text}")
        
        # Print word-level timestamps if available
        if 'words' in seg and seg['words']:
            for word_data in seg['words']:
                word = word_data['word']
                w_start = word_data['start']
                w_end = word_data['end']
                print(f"  └─ {word:20s} [{w_start:6.2f}s - {w_end:6.2f}s]")
    
    print("="*80)


def main():
    """Command-line interface for audio transcription."""
    parser = argparse.ArgumentParser(
        description='Transcribe Vietnamese audio with PhoWhisper/Whisper',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use PhoWhisper model from default location
  python scripts/transcribe_phowhisper.py audio.wav --model phowhisper
  
  # Use PhoWhisper model from custom location
  python scripts/transcribe_phowhisper.py audio.wav --model-path /path/to/phowhisper/model
  
  # Use OpenAI Whisper with base model
  python scripts/transcribe_phowhisper.py audio.wav --model base
  
  # Use larger Whisper model for better accuracy
  python scripts/transcribe_phowhisper.py audio.wav --model medium
  
  # Specify output file
  python scripts/transcribe_phowhisper.py audio.wav --output transcription.json
  
  # Show detailed segments
  python scripts/transcribe_phowhisper.py audio.wav --show-segments 10
  
  # Process downloaded YouTube audio with PhoWhisper
  python scripts/transcribe_phowhisper.py temp/downloads/VIDEO_ID_Title/audio.wav --model phowhisper

Available models:
  - phowhisper: Vietnamese-optimized Whisper (requires local model)
  - tiny: Fastest Whisper, least accurate
  - base: Good balance (default)
  - small: Better accuracy
  - medium: High accuracy (recommended)
  - large: Best accuracy, slowest
        """
    )
    
    parser.add_argument(
        'audio_path',
        help='Path to audio file (WAV, MP3, etc.)'
    )
    
    parser.add_argument(
        '--model',
        '-m',
        default='base',
        help='Whisper model size (tiny/base/small/medium/large) or "phowhisper" to use local PhoWhisper'
    )
    
    parser.add_argument(
        '--model-path',
        '-p',
        help='Path to local model directory (for PhoWhisper or custom models)'
    )
    
    parser.add_argument(
        '--language',
        '-l',
        default='vi',
        help='Language code (default: vi for Vietnamese)'
    )
    
    parser.add_argument(
        '--output',
        '-o',
        help='Output JSON file path (default: same as audio with .json extension)'
    )
    
    parser.add_argument(
        '--show-segments',
        '-s',
        type=int,
        metavar='N',
        help='Show first N segments with word timestamps'
    )
    
    parser.add_argument(
        '--quiet',
        '-q',
        action='store_true',
        help='Suppress verbose output'
    )
    
    parser.add_argument(
        '--no-punctuation',
        action='store_true',
        help='Skip punctuation restoration (not recommended for TTS)'
    )
    
    args = parser.parse_args()
    
    # Validate audio file
    audio_path = Path(args.audio_path)
    if not audio_path.exists():
        print(f"Error: Audio file not found: {audio_path}")
        sys.exit(1)
    
    # Use PhoWhisper path if available
    model_path = args.model_path
    if not model_path and args.model == 'phowhisper':
        # Default PhoWhisper model path
        default_path = "/home/psilab/TRANSCRIBE-AUDIO-TO-TEXT-WHISPER/model/snapshots/55a7e3eb6c906de891f8f06a107754427dd3be79"
        if Path(default_path).exists():
            model_path = default_path
            if not args.quiet:
                print(f"Using default PhoWhisper model at: {model_path}")
        else:
            print(f"Error: PhoWhisper model not found at default path: {default_path}")
            print("Please specify model path with --model-path")
            sys.exit(1)
    
    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = audio_path.parent / f"{audio_path.stem}_transcription.json"
    
    try:
        # Transcribe audio
        transcription = transcribe_with_timestamps(
            audio_path=audio_path,
            model_name=args.model,
            language=args.language,
            verbose=not args.quiet,
            model_path=model_path,
            add_punctuation=not args.no_punctuation
        )
        
        # Save transcription
        save_transcription(transcription, output_path, verbose=not args.quiet)
        
        # Show segments if requested
        if args.show_segments:
            print_segments(transcription, max_segments=args.show_segments)
        
        # Print JSON output for programmatic use in quiet mode
        if args.quiet:
            print(json.dumps({'output': str(output_path)}, indent=2))
        
        sys.exit(0)
        
    except KeyboardInterrupt:
        print("\n\nTranscription interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

# python scripts/transcribe_phowhisper.py temp/downloads/202512051057/audio.wav --model phowhisper