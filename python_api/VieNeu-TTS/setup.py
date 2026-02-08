from setuptools import setup, find_packages

setup(
    name="vieneu",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "torch",
        "torchaudio",
        "numpy",
        "soundfile",
        "transformers",
        "accelerate",
    ],
    python_requires=">=3.8",
)
