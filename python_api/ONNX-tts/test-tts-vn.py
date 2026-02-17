from piper import PiperVoice
import wave

voice = PiperVoice.load("vi_VN-vais1000-medium.onnx")

audio_stream = voice.synthesize("Xin chào! Đây là giọng đọc tiếng Việt của tôi.")

first_chunk = next(audio_stream)

with wave.open("out_vi.wav", "wb") as wav_file:
    wav_file.setnchannels(first_chunk.sample_channels)
    wav_file.setsampwidth(first_chunk.sample_width)
    wav_file.setframerate(first_chunk.sample_rate)

    wav_file.writeframes(first_chunk.audio_int16_bytes)

    for chunk in audio_stream:
        wav_file.writeframes(chunk.audio_int16_bytes)

print("DONE — Vietnamese WAV generated.")
