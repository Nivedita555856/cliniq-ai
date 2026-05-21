# ClinIQ AI — FastAPI Backend Dockerfile
# For deployment on Render (Docker runtime)

FROM python:3.11-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first (layer caching)
COPY requirements.txt .

# Install CPU-only PyTorch first (much smaller than default — avoids OOM on Render)
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    torchvision==0.17.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
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

# Copy data directory if it exists
COPY data/ ./data/

# Create empty subscribers file so digest service works on first boot
RUN echo "[]" > subscribers.json

# Non-root user for security
RUN adduser --disabled-password --gecos '' appuser \
    && chown -R appuser:appuser /app
USER appuser

# Expose port (Render sets PORT env var)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Start server
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
