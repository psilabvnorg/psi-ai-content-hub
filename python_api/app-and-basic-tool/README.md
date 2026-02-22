python -m venv venv

# Activate and install
venv\Scripts\activate

---
pip install -r requirements.txt
---
python -m app.main
-----
port 6901
---
http://127.0.0.1:6901
http://127.0.0.1:6901/docs