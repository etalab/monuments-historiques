FROM node:5

RUN mkdir -p /app

ADD package.json /app
WORKDIR /app

RUN npm install --production

ADD ./ /app

CMD npm run build
