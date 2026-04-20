FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (separate layer for cache efficiency)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Cloud Run sets $PORT at runtime (default 8080).
# Using shell form so the variable is expanded.
ENV PORT=8080
EXPOSE 8080

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
