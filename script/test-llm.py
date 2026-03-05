import requests

URL = "http://localhost:11434/api/generate"
MODEL = "deepseek-r1:8b"
PROMPT = "Hi"

resp = requests.post(URL, json={"model": MODEL, "prompt": PROMPT, "stream": False})
resp.raise_for_status()
data = resp.json()
print(data.get("response", data))
