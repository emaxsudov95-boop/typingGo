# Hugging Face Space uchun: kodni GitHub'dan olib, frontendni build qiladi va bitta Node serverni ishga tushiradi.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# main branch o'zgarsa kesh yangilanadi va eng so'nggi kod olinadi
ADD https://api.github.com/repos/emaxsudov95-boop/typingGo/git/refs/heads/main /tmp/version.json
RUN git clone --depth 1 https://github.com/emaxsudov95-boop/typingGo.git . \
 && npm --prefix server install --omit=dev \
 && npm --prefix client install --include=dev \
 && npm --prefix client run build \
 && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860
USER node
CMD ["node", "server/src/index.js"]
