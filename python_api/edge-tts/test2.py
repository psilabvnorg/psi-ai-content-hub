import asyncio
import websockets
import uuid
import datetime

async def tts(text):
    url = (
        "wss://speech.platform.bing.com/consumer/speech/synthesize/"
        "readaloud/edge/v1?TrustedClientToken="
    )

    headers = {
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Accept-Language": "en-US,en;q=0.9",
    }

    async with websockets.connect(url, extra_headers=headers) as ws:

        # Config frame
        config_payload = (
            "Path: speech.config\r\n"
            "Content-Type: application/json\r\n\r\n"
            "{\"context\":{\"synthesis\":{\"audio\":{"
            "\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"true\","
            "\"wordBoundaryEnabled\":\"false\"},"
            "\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}"
        )
        await ws.send(config_payload)

        # SSML
        ssml = (
            f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' "
            f"xml:lang='en-US'>"
            f"<voice name='en-US-JennyNeural'>{text}</voice>"
            f"</speak>"
        )

        request_id = str(uuid.uuid4())
        ssml_payload = (
            f"Path: ssml\r\nX-RequestId: {request_id}\r\n"
            f"Content-Type: application/ssml+xml\r\n\r\n{ssml}"
        )
        await ws.send(ssml_payload)

        # Receive audio
        audio = b""
        while True:
            message = await ws.recv()
            if isinstance(message, bytes):
                audio += message
            else:
                if "Path:turn.end" in message:
                    break

    # Save audio
    with open("output.mp3", "wb") as f:
        f.write(audio)

    print("Saved: output.mp3")


asyncio.run(tts("Hello! This WebSocket version bypasses 401."))
