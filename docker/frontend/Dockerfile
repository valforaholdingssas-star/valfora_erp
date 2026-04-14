# syntax=docker/dockerfile:1
FROM node:20.18-alpine

WORKDIR /app

COPY FRONTEND/package.json ./
RUN npm install

COPY FRONTEND .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
