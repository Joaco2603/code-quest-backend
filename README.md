# Qwerty V2 — Generador de rutas de aprendizaje

**DevTalles Code Quest #3** · Mission file `DEV-CQ03-2026` · Equipo **#05: Qwerty V2**

Aplicación para que estudiantes de [DevTalles](https://devtalles.com) descubran una **ruta de aprendizaje** a partir de sus intereses, metas profesionales y nivel actual, usando los cursos de la plataforma.

> Objetivo de la misión: formar crew, resolver el brief y entregar una app funcional, documentada y desplegada.

---

## Equipo

| Discord | Rol |
| --- | --- |
| restoker12 | Integrante |
| n.rodriguez | Integrante |
| pappagamer2603 | Integrante |

---

## Entrega (Code Quest)

| Recurso | Enlace |
| --- | --- |
| Repositorio | _URL pública de GitHub_ |
| Demo en video (1–1:30 min) | _URL del video / canal de Discord del equipo_ |
| App desplegada | _URL de producción_ |

---

## Qué resuelve

Los estudiantes suelen no saber **por dónde empezar** ni **qué curso sigue** según su objetivo. Esta app:

1. Evalúa habilidades e intereses con un cuestionario.
2. Genera **rutas dinámicas** con cursos disponibles en DevTalles.
3. Permite **guardar varias rutas** por usuario.
4. Permite **marcar progreso** sobre cada ruta.
5. Incluye **registro e inicio de sesión**, con **Discord** como proveedor OAuth.

El diseño busca quedar abierto a nuevas características para la comunidad (más providers, más catálogos, recomendaciones, etc.).

### Requerimientos del brief

| Requerimiento | Estado |
| --- | --- |
| Cuestionario de habilidades e intereses | Backend de autoevaluación implementado; integración frontend pendiente |
| Rutas dinámicas con cursos de DevTalles | En progreso |
| Guardar y generar múltiples rutas | En progreso |
| Progreso de la ruta | En progreso |
| Auth (registro / login) + Discord | Backend implementado; recorrido real con frontend pendiente |
| Stack de cursos DevTalles | NestJS, TypeScript, PostgreSQL, TypeORM |
| Licencia MIT | Ver [LICENSE](LICENSE) |

---

## Stack

- **Runtime:** Node.js
- **API:** [NestJS](https://nestjs.com) 12 (TypeScript, ESM)
- **ORM / DB:** TypeORM + PostgreSQL
- **Validación:** `class-validator` / `class-transformer`
- **Docs API:** Swagger UI (`/api/docs`) y Scalar (`/api/reference`)
- **Gestor de paquetes:** [pnpm](https://pnpm.io)

Prefijo global de la API: `/api`.

---

## Requisitos locales

- Node.js 22+ (recomendado)
- pnpm
- PostgreSQL 14+

---

## Configuración

1. Clona el repositorio.

```bash
git clone <url-del-repo>
cd code-quest
```

2. Instala dependencias.

```bash
pnpm install
```

3. Crea un archivo `.env` en la raíz (no se versiona). Ejemplo para desarrollo:

```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5433
DB_NAME=code_quest
DB_USERNAME=postgres
DB_PASSWORD=postgres

# Opcional. En desarrollo, si se omite: http://localhost:8080 y http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

# Requeridos en production
# DB_HOST, DB_NAME, DB_USERNAME y DB_PASSWORD deben definirse explícitamente.

# JWT_SECRET: mínimo 32 caracteres aleatorios.
# ENCRYPTION_KEY: 32 bytes en hexadecimal (64 caracteres).
JWT_SECRET=
ENCRYPTION_KEY=
# Discord OAuth: requerido en production
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_CALLBACK_URL=http://localhost:3000/api/auth/discord/callback
FRONTEND_URL=http://localhost:8080

# TypeORM
DB_SYNCHRONIZE=false   # usar migraciones
# DB_MIGRATIONS_RUN=false
DB_SSL=false          # production usa TLS verificado por defecto
# DB_LOGGING=true
```

4. Inicia PostgreSQL con Docker (crea la base y conserva sus datos en un volumen):

```bash
docker compose -p codequest-dev -f compose.dev.yml up -d --wait
```

Si ya usas otra instancia PostgreSQL, ajusta host, puerto y credenciales en `.env` y crea la base allí:

```sql
CREATE DATABASE code_quest;
```

5. Aplica las migraciones de usuarios, auditoría, catálogo y cuestionarios (en una base nueva):

```bash
pnpm migration:run
```

La configuración completa está en [`.env.example`](.env.example). No se cargan cursos automáticamente. Para importar `COURSES.enriched.json` y el cuestionario inicial, consulta [la guía de carga](docs/content-import.md).
Si ya existen tablas creadas desde un esquema anterior, revisa su adaptación antes de ejecutar la migración inicial.

## Cómo ejecutar

```bash
# desarrollo (watch)
pnpm start:dev

# producción (build + node)
pnpm build
pnpm start:prod
```

La API queda en `http://localhost:3000/api`.

Documentación disponible al iniciar:

- Documentación: `http://localhost:3000/api/docs`
- Referencia Scalar: `http://localhost:3000/api/reference`

### Registro público y login

`POST /api/auth/register` no requiere sesión. Crea una cuenta activa con rol
`user`, sin cambio obligatorio de contraseña ni inscripción obligatoria en 2FA.

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"estudiante@example.com","password":"Password123!","first_name":"Ana","last_name":"Perez"}'

curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"estudiante@example.com","password":"Password123!"}'
```

Ambos devuelven `{ "data": { "accessToken": "...", "user": { ... } } }`.
Usa el token como `Authorization: Bearer <accessToken>`; puedes comprobar la
sesión con `GET /api/auth/renovated`. El registro rechaza campos administrativos
como `role`, `client_id` e `isActive`. La contraseña requiere 8–20 caracteres,
mayúscula, minúscula y un número o carácter especial.

El MVP no exige 2FA, incluso para cuentas `admin`/`client` o con 2FA previamente
activado. Las rutas `/api/2fa/*`, `/api/auth/2fa/verify` y
`/api/auth/forgot-password-2fa` no están disponibles. Los datos de 2FA existentes
se conservan. Solo los tokens con `purpose: access` permiten usar rutas protegidas
y renovar sesiones; los tokens temporales no otorgan acceso general. Las cuentas
con cambio de contraseña pendiente deben completarlo. Esta política también se
aplica al login con Discord.

La creación administrativa que antes usaba `POST /api/auth/register` pasa a
`POST /api/auth/register/managed`, con los mismos permisos. Esa alta no abre
sesión: responde `{ "data": { "requiresPasswordChange": true, "userId": "...", "tempToken": "..." } }`
porque la cuenta nace con cambio de contraseña pendiente. Actualiza sus clientes.
`POST /api/auth/register/user` sigue siendo exclusivo de administradores y usa
el mismo desafío.

### Scripts

| Script | Descripción |
| --- | --- |
| `pnpm start:dev` | Servidor en watch |
| `pnpm build` | Compila a `dist/` |
| `pnpm start:prod` | Corre `dist/main.js` |
| `pnpm lint` | Oxlint |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm test:e2e` | Tests e2e |
| `pnpm test:cov` | Cobertura |

---

## Arquitectura (API)

```
src/
  main.ts              bootstrap
  app.module.ts        módulo raíz
  auth/                sesión, Discord y cambio de contraseña
  user/                cuentas administradas
  catalog/             cursos, categorías, tecnologías y contrato para roadmaps
  questions/           cuestionarios e intentos
  roadmaps/            rutas del usuario y progreso por curso
  common/              límite, errores, auditoría y cifrado
  health/              GET /api/health
  database/migrations/ esquema versionado
  config/
    envs.ts            variables de entorno
    typeorm.ts         DataSource
    setup.ts           CORS, Helmet, ValidationPipe, prefijo /api
    swagger.ts         OpenAPI + Scalar
```

## Guías

| Tema | Documento |
| --- | --- |
| Auth y Discord | [docs/auth.md](docs/auth.md) |
| Usuarios | [docs/users.md](docs/users.md) |
| Catálogo | [docs/catalog.md](docs/catalog.md) |
| Cuestionarios | [docs/questions.md](docs/questions.md) |
| Cuestionario adaptativo | [docs/cuestionario-adaptativo.md](docs/cuestionario-adaptativo.md) |
| Roadmaps | [docs/roadmaps.md](docs/roadmaps.md) |
| Límite, auditoría y salud | [docs/common.md](docs/common.md) |
| Despliegue | [docs/vps-deploy.md](docs/vps-deploy.md) |

---

## Catálogo implementado

Consulta [la guía del catálogo](docs/catalog.md) para endpoints, publicación, pruebas y contratos de integración.
Las lecturas muestran cursos publicados. Las escrituras administrativas del catálogo siguen detrás de
`CatalogAdminGuard`. Auth, usuarios, cuestionarios y roadmaps tienen guía propia en la tabla de arriba.

El [módulo de evaluaciones](docs/assessments.md) guarda respuestas y perfiles de autoevaluación
para el generador con IA. Incluye historial, aislamiento por usuario y reglas versionadas.
El [generador de rutas](docs/roadmaps.md) usa OpenAI sobre el catálogo publicado, sin base vectorial,
y guarda la ruta después de validar los cursos. El progreso por curso conserva las operaciones actuales.
Los cursos importados quedan como borradores hasta completar sus metadatos.

## Fechas de la misión

Desarrollo según el brief: **14 de septiembre – 28 de septiembre, 10:00 AM GMT-6 (CDMX)**.

Cualquier cambio al código del repositorio público **después del corte** puede descalificar al equipo.

---

## Licencia

MIT. Ver [LICENSE](LICENSE).

### Cuestionario adaptativo

La nueva versión reduce el formulario a cuatro preguntas iniciales y hasta tres autoevaluaciones según las tecnologías seleccionadas. Ver [preguntas, integración del frontend y migración](docs/cuestionario-adaptativo.md).
