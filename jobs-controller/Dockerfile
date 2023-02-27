FROM node:alpine


WORKDIR /jobs-controller
COPY . .
RUN npm install && npm run build
ENTRYPOINT [ "node", "build/main.js" ]
