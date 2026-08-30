FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt ./
# Reuse downloads during image rebuilds without copying the cache into the image.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY app.py test_app.py ./

EXPOSE 8000

# Readiness includes the database, so Compose will not start the web too early.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/readyz', timeout=2)"]

# ponytail: two workers fit the course demo; size this from load tests for production.
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "30", "app:app"]
