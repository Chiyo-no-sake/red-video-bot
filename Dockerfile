## Dockerfile to run telegram script with nodeJS 18 lts

FROM node:18.18.0-alpine

ENV TG_API_ID=x
ENV TG_API_HASH=x
ENV BOT_TOKEN=x
ENV PHONE=x
ENV VIDEO_DIR=x
ENV CONFIG_DIR=x

# Create app directory
WORKDIR /usr/src/app

# Bundle app source
COPY dist ./dist

# Run the script
CMD [ "node", "dist/src/index.js" ]