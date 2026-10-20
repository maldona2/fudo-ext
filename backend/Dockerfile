FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 5000

# Apply pending migrations (idempotent), then start the server
CMD ["sh", "-c", "npm run db:migrate:prod && npm start"]
