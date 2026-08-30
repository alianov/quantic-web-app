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

EXPOSE 80
