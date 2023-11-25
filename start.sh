#!/bin/bash

npm ci && npm run build &&
  docker compose up -d $@
