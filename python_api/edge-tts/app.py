import gradio as gr
import edge_tts
import asyncio
import tempfile
import os

async def get_voices():
    voices = await edge_tts.list_voices()
    return {f"{v['ShortName']} - {v['Locale']} ({v['Gender']})": v['ShortName'] for v in voices}

async def text_to_speech(text, voice, rate, pitch):
    if not text.strip():
        return None, "Please enter text to convert."
    if not voice:
        return None, "Please select a voice."
    
    voice_short_name = voice.split(" - ")[0]
    rate_str = f"{rate:+d}%"
    pitch_str = f"{pitch:+d}Hz"
    communicate = edge_tts.Communicate(text, voice_short_name, rate=rate_str, pitch=pitch_str)
    
    # Save directly to mp3 file (Edge TTS actually outputs mp3 format)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_file:
        tmp_path = tmp_file.name
        await communicate.save(tmp_path)
    
    return tmp_path, None

async def tts_interface(text, voice, rate, pitch):
    audio, warning = await text_to_speech(text, voice, rate, pitch)
    if warning:
        return audio, gr.Warning(warning)
    return audio, None

async def create_demo():
    voices = await get_voices()
    
    with gr.Blocks(analytics_enabled=False) as demo:
        gr.Markdown("# 🎙️ Edge TTS Text-to-Speech")
        
        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("## Text-to-Speech with Microsoft Edge TTS")
                gr.Markdown("""
                Convert text to speech using Microsoft Edge TTS. 
                Adjust speech rate and pitch: 0 is default, positive values increase, negative values decrease.
                """)
                
                gr.HTML("""
                <div style="margin: 20px 0; padding: 15px; border: 1px solid #4CAF50; border-radius: 10px; background-color: #f1f8e9;">
                    <p style="margin-top: 0;"><b>Looking for the new version with more features?</b></p>
                    <p>The new version includes:</p>
                    <ul>
                        <li><b>SRT Subtitle Support</b>: Upload SRT files or input SRT format text</li>
                        <li><b>File Upload</b>: Easily upload TXT or SRT files</li>
                        <li><b>Smart Format Detection</b>: Detects plain text or SRT format</li>
                        <li><b>MP3 Output</b>: Generate high-quality MP3 audio</li>
                    </ul>
                    <div style="text-align: center; margin-top: 15px;">
                        <a href="https://text-to-speech.wingetgui.com/" target="_blank" 
                           style="display: inline-block; 
                                  background: linear-gradient(45deg, #4CAF50, #8BC34A); 
                                  color: white; 
                                  padding: 12px 30px; 
                                  text-decoration: none; 
                                  border-radius: 30px; 
                                  font-weight: bold; 
                                  font-size: 16px;
                                  box-shadow: 0 4px 10px rgba(76, 175, 80, 0.3);
                                  transition: all 0.3s ease;">Try New Version ➔</a>
                    </div>
                </div>
                """)
            
            with gr.Column(scale=1):
                gr.HTML("""
                <div style="height: 100%; background-color: #f0f8ff; padding: 15px; border-radius: 10px;">
                    <h2 style="color: #1e90ff; margin-top: 0;">Turn Your Text Into Professional Videos!</h2>
                    <ul style="list-style-type: none; padding-left: 0;">
                        <li>✅ <b>40+ languages and 300+ voices supported</b></li>
                        <li>✅ <b>Custom backgrounds, music, and visual effects</b></li>
                        <li>✅ <b>Create engaging video content from simple text</b></li>
                        <li>✅ <b>Perfect for educators, content creators, and marketers</b></li>
                    </ul>
                    <div style="text-align: center; margin-top: 20px;">
                        <span style="font-size: 96px;">🎬</span>
                        <div style="margin-top: 15px;">
                            <a href="https://text2video.wingetgui.com/" target="_blank" 
                               style="display: inline-block; 
                                      background: linear-gradient(45deg, #2196F3, #21CBF3); 
                                      color: white; 
                                      padding: 12px 30px; 
                                      text-decoration: none; 
                                      border-radius: 30px; 
                                      font-weight: bold; 
                                      font-size: 16px;
                                      box-shadow: 0 4px 10px rgba(33, 150, 243, 0.3);
                                      transition: all 0.3s ease;">Try Text-to-Video ➔</a>
                        </div>
                    </div>
                </div>
                """)
                
        with gr.Row():
            with gr.Column():
                text_input = gr.Textbox(label="Input Text", lines=5)
                voice_dropdown = gr.Dropdown(choices=[""] + list(voices.keys()), label="Select Voice", value="")
                rate_slider = gr.Slider(minimum=-50, maximum=50, value=0, label="Speech Rate Adjustment (%)", step=1)
                pitch_slider = gr.Slider(minimum=-20, maximum=20, value=0, label="Pitch Adjustment (Hz)", step=1)
                
                generate_btn = gr.Button("Generate Speech", variant="primary")
                
                audio_output = gr.Audio(label="Generated Audio", type="filepath")
                warning_md = gr.Markdown(label="Warning", visible=False)
                
                generate_btn.click(
                    fn=tts_interface,
                    inputs=[text_input, voice_dropdown, rate_slider, pitch_slider],
                    outputs=[audio_output, warning_md]
                )
        
        gr.Markdown("Experience the power of Edge TTS for text-to-speech conversion, and explore our advanced Text-to-Video Converter for even more creative possibilities!")
    
    return demo

async def main():
    demo = await create_demo()
    demo.queue(default_concurrency_limit=50)
    demo.launch()

if __name__ == "__main__":
    asyncio.run(main())