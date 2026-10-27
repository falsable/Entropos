# Test toolchain for the a2dlc tests gate (.a2dlc/config.json -> tests.image).
# Node 22: the server imports node:sqlite (not in Node 20). The gate runs without network, so the repo's
# dependencies are baked in; the tests command symlinks /opt/app/node_modules into the tree under test.
# Rebuild when package-lock.json changes, from the repo root:
#   docker build -f .a2dlc/images/tests-node/Dockerfile -t a2dlc-tests-node:entropos .
FROM node:22-slim
WORKDIR /opt/app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
