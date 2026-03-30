FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libvips-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY models ./models
COPY yolo_service ./yolo_service

RUN mkdir -p uploads

EXPOSE 5001

CMD ["node", "server.js"]