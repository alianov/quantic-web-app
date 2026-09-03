FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
# Development and production both install the exact committed dependency set.
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS development

COPY . ./

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM development AS build

RUN npm run build

FROM caddy:2.11.4-alpine AS production

# The final image contains compiled files only; Node is not part of the runtime.
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

# Caddy keeps port 80 only for HTTP-to-HTTPS redirects.
ENV WEB_HTTPS_PORT=9443
EXPOSE 80 9443

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=12 \
    CMD wget -q --spider -T 2 "https://localhost:${WEB_HTTPS_PORT}/healthz"
