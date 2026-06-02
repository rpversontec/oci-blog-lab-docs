# OCI Blog Lab Docs

Sitio de documentación en Astro + Starlight para compartir el laboratorio de blog con estudiantes.

## Comandos

```bash
npm install
npm run docs:sync
npm run dev
npm run build
```

## Seguridad

Los documentos originales `GUIA_*.md` no se publican directamente. El script `tools/sanitize-docs.mjs` genera copias en `src/content/docs/` reemplazando OCIDs, namespaces, contraseñas de laboratorio y otros valores sensibles por placeholders.

Antes de desplegar una nueva versión, ejecuta:

```bash
npm run docs:sync
npm run build
```

## Publicación

El workflow `.github/workflows/deploy.yml` publica el sitio en GitHub Pages cuando se hace push a `main`. En GitHub, configura Pages con la fuente **GitHub Actions**.
