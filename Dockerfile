FROM node:18-alpine

WORKDIR /app

# Install dependencies for sharp and network troubleshooting
RUN apk add --no-cache \
    g++ \
    make \
    python3 \
    curl \
    ca-certificates

# Configure npm for better reliability
RUN npm config set strict-ssl false
RUN npm config set registry https://registry.npmjs.org/
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000

# Copy package files
COPY package*.json ./

# Clean npm cache and install dependencies
RUN npm cache clean --force && \
    npm install --legacy-peer-deps --no-optional

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Switch to production for runtime
ENV NODE_ENV=production

# The API key should be passed at runtime
# ENV OPENROUTER_API_KEY=your-api-key-here
# ENV OPENROUTER_DEFAULT_MODEL=your-default-model

# Run the server
CMD ["node", "dist/index.js"]
