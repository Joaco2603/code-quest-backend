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
| Cuestionario de habilidades e intereses | En progreso |
| Rutas dinámicas con cursos de DevTalles | En progreso |
| Guardar y generar múltiples rutas | En progreso |
| Progreso de la ruta | En progreso |
| Auth (registro / login) + Discord | En progreso |
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
DB_PORT=5432
DB_NAME=code_quest
DB_USERNAME=postgres
DB_PASSWORD=postgres

# Opcional. En desarrollo, si se omite: http://localhost:8080 y http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

# Requeridos en production
# ENCRYPTION_KEY=
# ENCRYPTION_IV=

# Rate limit (valores por defecto)
RATE_LIMIT_TTL_MS=60000
RATE_LIMIT_MAX=120

# JWT (requerido)
JWT_SECRET=change-me

# Discord OAuth (requerido en production)
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_CALLBACK_URL=http://localhost:3000/api/auth/discord/callback
FRONTEND_URL=http://localhost:8080
# DISCORD_FRONTEND_REDIRECT_PATH=/auth/discord

# TypeORM
# DB_SYNCHRONIZE=true   # por defecto true fuera de production
# DB_MIGRATIONS_RUN=false
# DB_LOGGING=true
```

4. Crea la base de datos:

```sql
CREATE DATABASE code_quest;
```

---

## Cómo ejecutar

```bash
# desarrollo (watch)
pnpm start:dev

# producción (build + node)
pnpm build
pnpm start:prod
```

La API queda en `http://localhost:3000/api`.

Cuando Swagger esté cableado en el bootstrap:

- Documentación: `http://localhost:3000/api/docs`
- Referencia Scalar: `http://localhost:3000/api/reference`

### Login con Discord

1. Crea una aplicación en el [portal de Discord](https://discord.com/developers/applications).
2. En **OAuth2 → Redirects** agrega `http://localhost:3000/api/auth/discord/callback`.
3. Copia el Client ID y el Client Secret al `.env`.
4. El botón de login del frontend debe abrir `http://localhost:3000/api/auth/discord`.
5. Discord vuelve al callback; la API redirige a `FRONTEND_URL/auth/discord?code=...` con un ticket de un solo uso (60s).
6. El frontend intercambia el ticket con `POST /api/auth/discord/exchange`.

Para vincular Discord a una cuenta ya existente (admin/password), usa `POST /api/auth/discord/link` con un JWT que ya haya pasado 2FA. El login de Discord **no** asocia cuentas solo porque el email coincida.

### Scripts

| Script | Descripción |
| --- | --- |
| `pnpm start:dev` | Servidor en watch |
| `pnpm build` | Compila a `dist/` |
| `pnpm start:prod` | Corre `dist/main` |
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
  config/
    envs.ts            variables de entorno
    typeorm.ts         DataSource
    setup.ts           CORS, Helmet, ValidationPipe, prefijo /api
    swagger.ts         OpenAPI + Scalar
```

---

## Fechas de la misión

Desarrollo según el brief: **14 de septiembre – 28 de septiembre, 10:00 AM GMT-6 (CDMX)**.

Cualquier cambio al código del repositorio público **después del corte** puede descalificar al equipo.

---

## Licencia

MIT. Ver [LICENSE](LICENSE).
