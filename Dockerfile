# Cueva API + jobs image. One image, two uses:
#   - API (default CMD):      uvicorn cueva.api.app:app
#   - Scheduled update job:   python -m cueva.cli update --limit 150  (override the command)
FROM python:3.12-slim

# Faster, quieter, no .pyc clutter.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# Install deps first so the layer caches across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code + schema (no web/, clients/, .env — see .dockerignore).
COPY cueva ./cueva
COPY schema.sql .

# Run as a non-root user.
RUN useradd --create-home --uid 1000 appuser
USER appuser

EXPOSE 8080

# Default: serve the API. Cloud Run/your platform sets $PORT; we honor it.
CMD ["sh", "-c", "uvicorn cueva.api.app:app --host 0.0.0.0 --port ${PORT}"]
