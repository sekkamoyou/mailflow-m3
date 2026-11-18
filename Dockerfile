# Overridable nginx base for hosts whose older kernels cannot exec binaries from
# the newest Alpine package repo (e.g. some NAS units) — set to an older tag like
# nginx:1.27-alpine via the NGINX_BASE build arg.
ARG NGINX_BASE=nginx:alpine

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# electron is a devDependency used only for desktop packaging (electron-builder),
# never by the web/vite build. Skip its ~100MB binary download so the multi-arch
# image build (incl. arm64 under QEMU) stays fast and can't fail on a flaky fetch.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci

COPY . .

ARG VITE_BUILD_SHA
ENV VITE_BUILD_SHA=${VITE_BUILD_SHA:-dev}
ARG VITE_EMAIL_DIV_RENDER
ENV VITE_EMAIL_DIV_RENDER=${VITE_EMAIL_DIV_RENDER:-false}
ARG VITE_FRONTEND_SOURCE_URL
ARG VITE_BACKEND_SOURCE_URL
ENV VITE_FRONTEND_SOURCE_URL=${VITE_FRONTEND_SOURCE_URL} \
    VITE_BACKEND_SOURCE_URL=${VITE_BACKEND_SOURCE_URL}

RUN npm run build

FROM ${NGINX_BASE}

RUN apk add --no-cache openssl

COPY --from=builder /app/dist /usr/share/nginx/html

# The config is baked in, NOT rendered at runtime. 3.4.3 made it an envsubst template to get
# the resolver right on non-Docker runtimes (#448), but that made /etc/nginx/conf.d a startup
# write and broke read-only root filesystems (#453) — the image's entrypoint runs under
# `set -e`, so the failed write stopped nginx booting at all.
#
# Only one marked line is rewritten now, in place, and failing to rewrite it is survivable:
# 16-detect-resolver.sh corrects the resolver from the container's real /etc/resolv.conf when
# it can, and leaves the shipped Docker default when it cannot. Read-only filesystems start
# either way. The resolver is NOT an include — `resolve` requires one, so a glob that matched
# nothing would stop nginx booting.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY detect-resolver.sh /docker-entrypoint.d/16-detect-resolver.sh
COPY set-backend.sh /docker-entrypoint.d/17-set-backend.sh
COPY generate-cert.sh /docker-entrypoint.d/10-generate-cert.sh
COPY set-tls.sh /docker-entrypoint.d/18-set-tls.sh
RUN chmod +x /docker-entrypoint.d/10-generate-cert.sh /docker-entrypoint.d/16-detect-resolver.sh /docker-entrypoint.d/17-set-backend.sh /docker-entrypoint.d/18-set-tls.sh

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
