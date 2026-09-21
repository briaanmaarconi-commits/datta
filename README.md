# Datta — Gestión de mesas

Sistema de gestión de mesas para restaurantes y cafeterías (pedidos, cocina, caja, analíticas y menú QR para clientes), construido con React + Vite + shadcn/ui y Supabase como backend.

## Desarrollo local

```bash
npm install
cp .env.example .env   # completar con las credenciales de Supabase
npm run dev
```

## Build

```bash
npm run build
```

## Despliegue

La app se sirve como sitio estático (build de Vite) detrás de nginx. El `Dockerfile` en la raíz arma la imagen en dos etapas:

1. `node:20-alpine` instala dependencias y corre `npm run build`, recibiendo las variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_SUPABASE_PROJECT_ID` como build args.
2. `nginx:alpine` sirve el contenido de `dist/` usando `nginx.conf`.

Se despliega en un VPS propio mediante [Coolify](https://coolify.io), apuntando a este repositorio de GitHub. El dominio configurado es **genesisqr.com**.
