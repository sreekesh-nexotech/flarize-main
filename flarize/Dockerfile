# Flarize BOM / Quotation platform — UAT image.
# Playwright's official image ships Node 20 + Chromium with every system
# library, so the server-side PDF route works out of the box (the npm
# `playwright` version below must match the image tag).
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=10000

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# 2026-09-13: the legacy React admin tool (src/App.jsx → dist/) is no longer
# built — nothing links to it and every workspace page lives under public/.
# Re-add `RUN npx vite build` if it is ever needed again.

EXPOSE 10000
CMD ["bash", "deploy/render-start.sh"]
