# Stage 1: Build React frontend
FROM node:24-alpine AS frontend-builder
ARG VITE_SITE_URL=
ENV VITE_SITE_URL=$VITE_SITE_URL
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python API + nginx
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY services/ ./services/
COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh .
RUN chmod +x start.sh && mkdir -p data/sessions data/jobs

COPY --from=frontend-builder /app/frontend/dist /var/www/html

VOLUME ["/app/data"]

EXPOSE 8080
CMD ["./start.sh"]
