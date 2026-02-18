"""Very simple test for edge-tts."""
import asyncio
import edge_tts
import os

async def test_list_voices():
    """Test that we can list available voices."""
    voices = await edge_tts.list_voices()
    assert len(voices) > 0, "No voices found!"
    print(f"✅ Found {len(voices)} voices.")
    # Print first 3
    for v in voices[:3]:
        print(f"   - {v['ShortName']} ({v['Locale']}, {v['Gender']})")

async def test_tts_generate():
    """Test generating speech from text."""
    output_file = "test_output.mp3"
    communicate = edge_tts.Communicate("Hello, this is a test.", "en-US-AriaNeural")
    await communicate.save(output_file)
    assert os.path.exists(output_file), "Output file not created!"
    size = os.path.getsize(output_file)
    assert size > 0, "Output file is empty!"
    print(f"✅ Generated audio: {os.path.abspath(output_file)} ({size} bytes)")

async def main():
    print("=== Edge TTS Simple Test ===\n")
    await test_list_voices()
    print()
    await test_tts_generate()
    print("\n✅ All tests passed!")

if __name__ == "__main__":
    asyncio.run(main())
