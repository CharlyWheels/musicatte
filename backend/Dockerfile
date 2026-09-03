FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# OpenCV (headless) still needs these; without them the image preprocessing
# that makes photo recognition work fails at import time.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libgomp1 curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
