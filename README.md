Model download :
C:\Users\ADMIN\AppData\Roaming\psi-ai-content-hub\models

temp video media output:
C:\Users\ADMIN\AppData\Local\Temp\psi_ai_content_hub\
-------
front end

npm run electron:dev
npm run dev

----
back end (Python 3.10, debug dev mode)

Create venv with Python 3.10 (from repo root):

# Remove old venv if present
Remove-Item -Recurse -Force .venv

# Create venv with Python 3.10 (ensure py -3.10 or python3.10 is on PATH)
python -m venv venv

# Activate and install
venv\Scripts\activate
pip install -r python_api\requirements.txt
pip install -e python_api\VieNeu-TTS

# Run API
python -m python_api.main

Use the venv's pip and python so neucodec and other deps are in the same env.
---

storage location config in python_api\settings.py
temp media file: C:\Users\ADMIN\AppData\Local\Temp\psi_ai_content_hub
logs, model: C:\Users\ADMIN\AppData\Roaming\psi-ai-content-hub
--

download link for tools/models dependency in python_api\services\tools_manager.py