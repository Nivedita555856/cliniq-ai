# ClinIQ AI — FastAPI Backend Dockerfile
# Lightweight build — RAG packages excluded (Groq-only mode on free tier)

FROM python:3.11-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend source files
COPY api.py \
     parser.py \
     rag_system.py \
     image_analyzer.py \
     disease_data.py \
     digest_service.py \
     data.py \
     ./

# Copy data directory
COPY data/ ./data/

# Create empty subscribers file
RUN echo "[]" > subscribers.json

# Non-root user
RUN adduser --disabled-password --gecos '' appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
