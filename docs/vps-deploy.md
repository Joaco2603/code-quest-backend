# Desplegar CodeQuest con Traefik

La API se publica en `https://api.nicorodriguez.com.ar/api/reference`.
El proyecto Compose se llama `codequest`: PostgreSQL tiene volumen propio y no publica puertos; Traefik llega a la API por la red externa `web` y emite TLS con el resolver existente `le`.

## Ubicación y operación

El VPS usa `/srv/apps/codequest/releases/<commit>` para cada versión,
`/srv/apps/codequest/current` para la versión activa y `/srv/apps/codequest/.env`
para los secretos (permisos `600`). El archivo `.env` no se incluye en la imagen ni en Git.

```bash
ssh -p 22022 nico@69.6.227.47
cd /srv/apps/codequest/current
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml ps
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml logs --tail=100 api
```

## Actualizar

Subir una copia del código validado a una nueva carpeta de releases. Configurar
`RELEASE_TAG` en el entorno del comando o en `.env` para identificar su imagen.
`CODEQUEST_ENV_FILE=/srv/apps/codequest/.env` debe estar definido en ese archivo.
Desde la carpeta de la nueva versión:

```bash
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml build api
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml up -d --wait postgres
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml run --rm --no-deps api node node_modules/typeorm/cli.js migration:run -d dist/config/typeorm.js
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml up -d --wait api
curl --fail https://api.nicorodriguez.com.ar/api/health
```

Las migraciones se ejecutan antes de iniciar la API, con `synchronize=false`.
Actualizar `current` hacia la nueva carpeta únicamente después de verificar el servicio.

Antes de una actualización con datos, guardar un backup:

```bash
umask 077
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /srv/apps/codequest/backup.dump
```

Para recuperar una versión anterior, entrar en su carpeta, seleccionar su
`RELEASE_TAG` y ejecutar `up -d --no-build api`. Confirmar antes que sus entidades
sean compatibles con las migraciones ya aplicadas. No borrar el volumen de PostgreSQL.

## Configuración

- `DISCORD_ENABLED=false`: permite el arranque sin credenciales de Discord; sus endpoints de autorización responden `503`. Para habilitarlo, cargar las credenciales y el callback `https://api.nicorodriguez.com.ar/api/auth/discord/callback`, cambiar a `true` y recrear la API.
- `JWT_SECRET` y `ENCRYPTION_KEY`: generados aleatoriamente en el servidor. Mantener la clave de cifrado entre versiones para conservar los secretos 2FA existentes.
- `API_DOMAIN=api.nicorodriguez.com.ar` y `HOST_API=https://api.nicorodriguez.com.ar` configuran el router y el servidor público en OpenAPI.
- `ALLOWED_ORIGINS`: orígenes explícitos del frontend y de la documentación. Agregar el frontend cuando exista.
- `DB_HOST=postgres`, `DB_PORT=5432`, `DB_SSL=false`: conexión interna de Compose. La conexión pública usa HTTPS en Traefik.

La base inicial está vacía. No se crean usuarios ni cursos automáticamente.
La administración del catálogo conserva el bloqueo pendiente de integración con autenticación.

## Validación de esta entrega

Compilar, ejecutar `pnpm typecheck` y `pnpm exec vitest run`. En el servidor,
verificar migraciones, salud de ambos contenedores y respuestas HTTPS de
`/api/health`, `/api/courses`, `/api/reference` y `/api/docs-json`.
El rollback de los archivos de despliegue y del flag Discord no requiere borrar datos.
