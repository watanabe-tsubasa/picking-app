# --- build stage ---
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# --- runtime stage ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/build ./build

EXPOSE 8080
CMD ["sh", "-lc", "./node_modules/.bin/react-router-serve ./build/server/index.js --host 0.0.0.0 --port ${PORT:-8080}"]
