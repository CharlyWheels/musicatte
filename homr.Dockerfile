FROM python:3.11-slim

# Pinned. An unpinned `git clone` means recognition accuracy can change between
# two builds of the same commit of this repository, with no way to tell which
# HOMR produced a given result.
ARG HOMR_REF=v0.6.0

RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir poetry==1.8.5

RUN git clone --depth 1 --branch "${HOMR_REF}" https://github.com/liebharc/homr.git /app/homr \
    || git clone https://github.com/liebharc/homr.git /app/homr \
       && cd /app/homr && git checkout "${HOMR_REF}"

WORKDIR /app/homr
RUN poetry config virtualenvs.create false && \
    poetry install --only main

# Download the models at build time, and fail the build if they do not arrive.
# This used to end in `|| true`, which produced images that built green and
# then failed on every request in production.
RUN poetry run homr --init && \
    python -c "import homr; print('HOMR import OK')"

RUN pip install --no-cache-dir \
        fastapi==0.121.2 \
        "uvicorn[standard]==0.38.0" \
        python-multipart==0.0.20

COPY homr-api.py /app/homr/api.py

EXPOSE 8000

# One worker: the process holds a torch model and serialises inference anyway.
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
