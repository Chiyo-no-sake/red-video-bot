## Dockerfile to run telegram script with nodeJS 18 lts

FROM node:18

ENV TG_API_ID=x
ENV TG_API_HASH=x
ENV BOT_TOKEN=x
ENV PHONE=x

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm install
RUN npm run build

# Bundle app source
COPY . .

# Run the script
CMD [ "node", "dist/src/index.js" ]