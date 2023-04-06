FROM node:alpine

WORKDIR /mina-load-generator
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

ENTRYPOINT [ "node", "build/src/main.js" ]
