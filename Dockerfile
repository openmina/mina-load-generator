FROM node:alpine

WORKDIR /mina-sample-zkapp
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build
ENTRYPOINT [ "node", "build/src/send.js" ]
