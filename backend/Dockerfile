# Backend — Node 20 (development image; producción se endurece en FASE 10)
FROM node:20-alpine

WORKDIR /app

# OpenSSL requerido por Prisma en Alpine
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .

# Genera el cliente Prisma (schema sin modelos aún en FASE 0)
RUN npx prisma generate || true

EXPOSE 3000

CMD ["npm", "run", "dev"]
