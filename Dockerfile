# Use an official Node image
FROM node:18-slim

# Set the directory for your code
WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install --production

# Copy the rest of your code
COPY . .

# Cloud Run uses port 8080 by default
ENV PORT=5000
EXPOSE 5000

# Starts your app using the 'start' script in package.json
CMD ["npm", "start"]
