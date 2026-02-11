python -m venv venv

# Activate and install
venv\Scripts\activate

pip install torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cu118

pip install -r requirements.txt

--
python simple_tts_test.py

---
python -m app.main

---


Invoke-RestMethod -Uri "http://127.0.0.1:6903/api/v1/generate" -Method Post -Body '{"text":"Highlander EV 2027 có hình dáng đẹp mắt và công nghệ hiện đại","mode":"preset","voice_id":"binh_nam_bac"}' -ContentType "application/json; charset=utf-8"
--
Invoke-RestMethod -Uri "http://127.0.0.1:6903/api/v1/generate/download/tts_1770800009"
