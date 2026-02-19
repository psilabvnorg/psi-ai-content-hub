from setuptools import setup, find_packages

setup(
    name="multilingual-video-pipeline",
    version="0.1.0",
    description="Automated multilingual video reproduction and enhancement pipeline",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.9",
    install_requires=[
        "yt-dlp>=2024.1.1",
        "pillow>=10.0.0",
        "bing-image-downloader>=1.1.2",
        "requests>=2.31.0",
        "pydantic>=2.0.0",
        "pydantic-settings>=2.0.0",
        "python-dotenv>=1.0.0",
        "structlog>=23.1.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "hypothesis>=6.82.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
            "mypy>=1.5.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "mvp-pipeline=multilingual_video_pipeline.cli:main",
        ],
    },
)
