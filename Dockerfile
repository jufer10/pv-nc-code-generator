# Base image lightweight
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy only package files first (better caching)
COPY package*.json ./

# Install dependencies (prod only)
RUN npm ci --omit=dev

# Now copy project files
COPY . .

# Expose internal port for reverse proxy
EXPOSE 3000

# Start app
CMD ["npm", "start"]