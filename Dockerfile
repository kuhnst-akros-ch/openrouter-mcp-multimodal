FROM node:18-alpine

WORKDIR /app

# Install dependencies for sharp
RUN apk add --no-cache \
    g++ \
    make \
    python3

# Configure npm to handle potential certificate issues
RUN npm config set strict-ssl false
RUN npm config set registry https://registry.npmjs.org/

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Default environment variables
ENV NODE_ENV=production

# The API key should be passed at runtime
# ENV OPENROUTER_API_KEY=your-api-key-here
# ENV OPENROUTER_DEFAULT_MODEL=your-default-model

# Run the server
CMD ["node", "dist/index.js"]
