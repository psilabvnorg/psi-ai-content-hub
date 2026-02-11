python -m venv venv

# Activate and install
venv\Scripts\activate

pip install torch==2.4.0+cu124 torchaudio==2.4.0+cu124 --extra-index-url https://download.pytorch.org/whl/cu124
# etc.


pip install "numpy<2"

pip install f5-tts
--

python infer.py
---
python -m app.main

---
Invoke-RestMethod -Uri "http://127.0.0.1:6902/api/v1/generate" -Method Post -Body (@{voice_id="chi_phien";text="Highlander EV 2027 có hình dáng tổng thể có phần vuông vức hơn, với phần hông sau ít tròn trịa hơn so với mẫu xe hiện tại. Điểm đáng chú ý nhất là lưới tản nhiệt phía trên được bịt kín. Một lưới tản nhiệt nhỏ phía dưới hướng luồng không khí làm mát đến bộ pin và môtơ. Dải đèn chiếu sáng toàn chiều rộng được tách biệt với đèn pha LED.";speed=1.0} | ConvertTo-Json) -ContentType "application/json; charset=utf-8"

---
Invoke-RestMethod -Uri "http://127.0.0.1:6902/api/v1/generate/stream/voice_tts_0d65f4c009e344d98b627e20e3345740" -Method Get

--
Invoke-RestMethod -Uri "http://127.0.0.1:6902/api/v1/generate/download/voice_tts_0d65f4c009e344d98b627e20e3345740" -Method Get
