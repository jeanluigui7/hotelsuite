# Frontend — Angular 18 (development image; build de producción se define en FASE 10)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4200

# --host 0.0.0.0 para que el contenedor sea accesible desde el host
CMD ["npm", "start", "--", "--host", "0.0.0.0", "--poll", "2000"]
