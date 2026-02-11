python -m venv venv

# Activate and install
venv\Scripts\activate

pip install torch==2.4.0+cu124 torchaudio==2.4.0+cu124 --extra-index-url https://download.pytorch.org/whl/cu124
# etc.


pip install "numpy<2"

pip install f5-tts
--

python infer.py