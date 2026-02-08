front end

npm run electron:dev
npm run dev

----
back end (debug dev mode install)

cd python_api
pip install -r requirements.txt
pip install -e ./vieneu_tts
pip install -e python_api/vieneu_tts

.venv\Scripts\activate
Python -m python_api.main
---

storage location config in python_api\settings.py
temp media file: C:\Users\ADMIN\AppData\Local\Temp\psi_ai_content_hub
logs, model: C:\Users\ADMIN\AppData\Roaming\psi-ai-content-hub
--

download link for tools/models dependency in python_api\services\tools_manager.py