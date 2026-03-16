# Multi-stage build for React Frontend
FROM node:20-alpine AS build

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json yarn.lock* ./
RUN yarn install

# Copy source code and build
COPY . .

# Asegurar que node_modules locales (de Windows) no interfieran 
# y que los binarios tengan permisos de ejecución
RUN chmod +x node_modules/.bin/* || true

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN yarn build

# Final stage: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Copy custom nginx config for SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
