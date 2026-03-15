FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir poetry

RUN git clone https://github.com/liebharc/homr.git /app/homr
WORKDIR /app/homr
RUN poetry config virtualenvs.create false && \
    poetry install --only main

# Pre-download models
RUN poetry run homr --init || true

# Create a minimal FastAPI wrapper
RUN pip install --no-cache-dir fastapi uvicorn python-multipart

COPY homr-api.py /app/homr/api.py

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
