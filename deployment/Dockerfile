FROM python:3.12-slim AS base

WORKDIR /app

RUN addgroup --system robofix && adduser --system --ingroup robofix robofix

COPY deployment/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY pipeline/ pipeline/
COPY utils/ utils/
COPY data/ data/

RUN mkdir -p data/uploads && chown -R robofix:robofix /app

USER robofix

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["gunicorn", "backend.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "1", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "300", \
     "--access-logfile", "-"]
