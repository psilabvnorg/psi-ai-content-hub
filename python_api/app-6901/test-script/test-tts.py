from valtec_tts import TTS

tts = TTS()  # Auto-downloads model from Hugging Face
tts.speak("Xin chào các bạn", speaker="NF", output_path="hello.wav")

# Get audio array
audio, sr = tts.synthesize("Xin chào các bạn", speaker="NM1")

# Available speakers: NF, SF, NM1, SM, NM2
print(tts.list_speakers())