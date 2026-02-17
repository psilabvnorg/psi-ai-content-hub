from piper import PiperVoice
import wave

voice = PiperVoice.load("en_US-ryan-high.onnx")

audio_stream = voice.synthesize("Hello! This is Piper with a correct WAV file.")

# Get basic audio info from the first chunk
first_chunk = next(audio_stream)

sample_rate = first_chunk.sample_rate           # e.g., 22050
sample_width = first_chunk.sample_width         # bytes per sample (usually 2 for int16)
channels = first_chunk.sample_channels          # usually 1

# Open WAV writer
with wave.open("out.wav", "wb") as wav_file:
    wav_file.setnchannels(channels)
    wav_file.setsampwidth(sample_width)
    wav_file.setframerate(sample_rate)

    # Write first chunk + the rest
    wav_file.writeframes(first_chunk.audio_int16_bytes)

    for chunk in audio_stream:
        wav_file.writeframes(chunk.audio_int16_bytes)

print("DONE — out.wav is now valid and playable!")
