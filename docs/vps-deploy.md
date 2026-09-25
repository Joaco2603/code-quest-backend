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
```

Antes de ejecutar migraciones sobre una base con datos, guardar un backup nuevo
y comprobar que `pg_dump` terminó correctamente. Si falla, detener el despliegue:

```bash
umask 077
backup="/srv/apps/codequest/backup-$(date +%Y%m%d-%H%M%S).dump"
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup" || exit 1
test -s "$backup" || exit 1
```

Después del backup:

```bash
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml run --rm --no-deps api node node_modules/typeorm/cli.js migration:run -d dist/config/typeorm.js
docker compose --env-file /srv/apps/codequest/.env -f compose.traefik.yml up -d --wait api
curl --fail https://api.nicorodriguez.com.ar/api/health
```

Las migraciones se ejecutan antes de iniciar la API, con `synchronize=false`.
Actualizar `current` hacia la nueva carpeta únicamente después de verificar el servicio.

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

## Alcance de la revisión de seguridad del despliegue

Se revisaron el diff de despliegue, exclusión de secretos, redes de Compose,
permisos de la imagen, configuración de producción y desactivación de Discord.
La API corre sin root, con filesystem de solo lectura, sin capabilities y sin
escalamiento de privilegios; únicamente `/tmp` permite escrituras efímeras.
La imagen copia explícitamente los archivos necesarios para compilar.

Compilación, tipos, controles focalizados y configuración de Compose se
verificaron en un sandbox sin red externa ni credenciales. La consulta
`pnpm audit --prod --json` no reportó avisos para las 274 dependencias contabilizadas.
Esto no garantiza ausencia de vulnerabilidades nuevas o no publicadas.

La suite completa de Vitest no pudo repetirse dentro del límite de memoria
virtual del sandbox. El nuevo contenedor endurecido requiere un smoke test en
un entorno de despliegue antes de promoverlo. No se hicieron pruebas de ataque
ni se modificó producción durante esta revisión.

No se auditaron Cloudflare, el Traefik compartido, el host ni toda la autenticación.
En particular, verificar en un entorno controlado la identificación de clientes
y los límites de peticiones detrás de ambos proxies: no habilitar `trust proxy`
globalmente sin definir qué proxies son confiables. La cuenta inicial PostgreSQL
tiene privilegios de administración; separar el rol de migraciones del rol de la
API es una mejora pendiente. No reutilizar esa cuenta en otras bases o servicios.

## IP del cliente detrás de Traefik

Configurar `TRUST_PROXY` en el archivo usado por `CODEQUEST_ENV_FILE` con las IP
o CIDR de los proxies confiables, separados por comas. Vacío o `false` desactiva
la confianza; se rechazan booleanos `true`, números de saltos, nombres y redes `/0`.
Ejemplo para la IP verificada de Traefik: `TRUST_PROXY=172.18.0.3`. Fijar esa IP
en la configuración de red de Traefik o actualizar el valor si cambia al recrearlo.
No confiar en toda la red compartida `web` si incluye contenedores no confiables.
Recrear la API después de cambiar la variable; el compose ya carga ese archivo.

Express resuelve `request.ip` desde el socket y `X-Forwarded-For`, de derecha a
izquierda hasta el primer origen no confiable. Esta IP se usa en auditoría y
rate limiting. Los logs de éxito y error incluyen `ip`, `peerIp` (conexión directa)
y `forwardedFor` (encabezado sin validar, limitado a 2048 caracteres y omitido
cuando falta). No usar el encabezado crudo para autorizar ni limitar solicitudes.
Traefik debe conservar su validación de encabezados reenviados; no habilitar
`forwardedHeaders.insecure`. Si hay otro proxy delante, configurar su confianza
de forma explícita. Una petición desde el servidor del frontend puede mostrar
la IP de ese servidor en lugar de la del navegador.

Comprobar tras desplegar una petición válida y una ruta inexistente: `peerIp` debe
identificar Traefik y `ip` el origen resuelto. Una conexión directa desde un origen
no confiable no debe poder cambiar `ip` enviando `X-Forwarded-For`.

## Lectura de logs

`LOG_FORMAT=json` conserva JSON estructurado para producción; `LOG_FORMAT=pretty`
muestra una línea compacta con método, ruta, estado, duración, requestId y detalles.
Sin configurar, se usa pretty solamente en `NODE_ENV=development` y JSON en los
otros entornos. El nivel de éxitos ahora es `info` (antes `log`); adaptar filtros
externos que dependan de ese valor. `message` es texto y los detalles aparecen una
sola vez en `metadata`. Los rechazos 4xx son `warn`, sin stack; los 5xx conservan
`error` y stack. Los JWT rechazados distinguen `auth.token_missing`,
`auth.token_expired` y `auth.token_invalid` sin imprimir credenciales ni cambiar
la respuesta pública. Los health checks GET exitosos no imprimen logs HTTP,
pero conservan auditoría; sus fallos siguen visibles.

Reversión de esta limpieza: revertir su commit, independiente del cambio de rutas
`users` y proxies. No requiere migraciones ni cambios de datos.
