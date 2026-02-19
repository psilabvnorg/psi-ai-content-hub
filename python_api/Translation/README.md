python -m venv venv

# Activate and install
venv\Scripts\activate
pip install -r requirements.txt

# Run Translation API (port 6906)
python -m app.main
