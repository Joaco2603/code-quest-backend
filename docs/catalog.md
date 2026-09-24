# Catálogo de cursos

El catálogo permite preparar cursos como borradores, publicarlos cuando están completos y archivarlos sin perder sus IDs. Las categorías son administrables; los niveles son fijos. La [carga explícita de `COURSES.json`](content-import.md) crea borradores sin inventar datos faltantes.

## Ejecutar

1. Instala dependencias con `pnpm install`.
2. Copia `.env.example` a `.env`. Para PostgreSQL local con datos persistentes, ejecuta `docker compose -p codequest-dev -f compose.dev.yml up -d --wait`. Usa el puerto `5433` del ejemplo; si ya tienes PostgreSQL, ajusta la conexión en `.env`.
3. Ejecuta `pnpm migration:run` y `pnpm start:dev`.
4. Abre `/api/docs` o `/api/reference`. `/api/docs-json` entrega OpenAPI.

`pnpm migration:show` muestra el estado. `pnpm migration:revert` revierte la última migración: la reversión inicial **elimina las tablas y los datos del catálogo**. No debe ejecutarse sobre datos que quieras conservar ni después de agregar tablas externas que los referencien.

No se aplica ninguna migración al arrancar por defecto. `DB_MIGRATIONS_RUN=true` permite hacerlo explícitamente. La sincronización automática está desactivada. En producción se exigen host, nombre, usuario y contraseña explícitos; TLS verifica el certificado salvo que configures `DB_SSL=false` para una conexión que no lo use.

## Endpoints

Todos llevan el prefijo `/api`. Las respuestas usan propiedades JSON en camelCase; PostgreSQL usa snake_case.

| Método y ruta | Comportamiento |
| --- | --- |
| `GET /courses` | Cursos publicados; respuesta `{data, meta:{total, limit, offset}}` |
| `GET /courses/:id` | Curso publicado o `404`; respuesta `{data:{...}}` |
| `GET /levels` | `{data:["beginner", "intermediate", "advanced"]}` |
| `GET /categories`, `GET /technologies` | Listas ordenadas por nombre; respuesta `{data:[...]}` |
| `GET /categories/:id`, `GET /technologies/:id` | Consulta individual; respuesta `{data:{id, name}}` |
| `POST /categories`, `POST /technologies` | Crear con `{name}`; administrador; respuesta `{data:{id, name}}` |
| `PATCH /categories/:id`, `PATCH /technologies/:id` | Renombrar con `{name}`; administrador; respuesta `{data:{id, name}}` |
| `DELETE /categories/:id`, `DELETE /technologies/:id` | Eliminar si no se usan; administrador; `204` |
| `GET /admin/courses`, `GET /admin/courses/:id` | Incluye borradores y archivados; administrador; listado `{data, meta}`, detalle `{data:{...}}` |
| `POST /admin/courses` | Crear borrador; administrador; `201` con `{data:{...}}` |
| `PATCH /admin/courses/:id` | Editar; administrador; respuesta `{data:{...}}` |
| `POST /admin/courses/:id/publish` | Publicar; administrador; respuesta `{data:{...}}` |
| `POST /admin/courses/:id/draft` | Retirar publicación o restaurar archivado a borrador; administrador; respuesta `{data:{...}}` |
| `POST /admin/courses/:id/archive` | Archivar sin borrar; administrador; respuesta `{data:{...}}` |

Curso serializado (campos exactos, sin spreads): `id, title, description|null, url|null, imageUrl|null, durationMinutes|null, instructor|null, level|null, status, createdAt|ISO UTC, updatedAt|ISO UTC, categories:[{id, name}], technologies:[{id, name}], prerequisiteIds:number[] ordenados`. Una lista vacía devuelve `data:[]`; una página vacía conserva `meta.total`.

Filtros: `search` busca una subcadena literal del título; `level`, `categoryId` y `technologyId` se combinan con AND. Paginación: entradas `page=1`, `limit=20` por defecto, máximo 100 resultados por página, orden por ID; salida `meta:{total, limit, offset}` con `offset=(page-1)*limit`. Si llegan `page` y un `offset` distinto de cero, tienen que describir la misma página (`page=1` solo coincide con `offset=0`); si no, la petición es `400`. Solo el listado administrativo acepta `status`.

Ejemplo de curso completo para `POST /api/admin/courses`, con una sesión administradora completa:

```json
{
  "title": "TypeScript: fundamentos",
  "description": "Bases del lenguaje y del sistema de tipos.",
  "url": "https://cursos.devtalles.com/courses/typescript",
  "imageUrl": "https://example.com/typescript.png",
  "durationMinutes": 180,
  "instructor": "Nombre del instructor",
  "level": "beginner",
  "categoryIds": [1, 2],
  "technologyIds": [1],
  "prerequisiteIds": []
}
```

Estos enlaces son ejemplos, no datos verificados del catálogo. Las categorías y tecnologías referenciadas deben existir.

Un borrador requiere únicamente `title`. Para publicar se exigen descripción, URL, imagen, duración positiva en minutos, instructor, nivel y al menos una categoría y tecnología. Los prerrequisitos son opcionales, pero si existen deben estar publicados.

Las relaciones se reemplazan por completo cuando se envía su array. Un array vacío las limpia; omitirlo las conserva. Los campos opcionales pueden limpiarse con `null` en un borrador. No se admiten `null` en título ni arrays, IDs duplicados, campos desconocidos o ciclos. Los IDs de rutas, filtros y relaciones deben estar entre 1 y 2147483647, el rango positivo de las claves de PostgreSQL. Editar un publicado vuelve a validar sus requisitos. Los archivados deben restaurarse a borrador antes de editarlos.

Para archivar o pasar a borrador un prerrequisito de cursos publicados, primero hay que retirar la publicación de esos dependientes o modificar sus prerrequisitos. Así no se ofrecen rutas nuevas con dependencias inaccesibles. Las escrituras del catálogo se serializan con un advisory lock transaccional de PostgreSQL para impedir ciclos o publicaciones inválidas bajo concurrencia.

Errores: `400` para datos inválidos o publicación incompleta; `403` para administración sin autorización; `404` para recursos inexistentes/no visibles; `409` para duplicados, categorías o tecnologías en uso, ciclos y conflictos de estado. Los nombres se comparan sin distinguir mayúsculas y tras quitar espacios exteriores.

## Autenticación administrativa

`CatalogAdminGuard` verifica el JWT mediante Passport, carga el rol actual desde la base y exige una sesión completa con rol `admin`. Deniega tokens temporales, recuperación y cambio de contraseña pendiente. Un anónimo recibe `401`; un estudiante autenticado recibe `403`.

Las lecturas públicas conservan su acceso. Hay pruebas HTTP con JWT firmados y la estrategia real, además de las pruebas de negocio que sustituyen el guard dentro de su harness. El guard de roles compartido también respeta los permisos declarados sobre controladores, como los de preguntas y opciones.

Para disponer de una cuenta administradora inicial, consultar [carga de contenido](content-import.md#cuenta-administradora).

## Integrar roadmaps y LLM — Persona 2

Importa `CatalogModule` e inyecta `CatalogService`:

| Método interno | Uso |
| --- | --- |
| `getPublishedCatalog()` | Catálogo completo elegible para enviar al LLM, con `prerequisiteIds` (DTOs sin envoltura HTTP) |
| `validateRoadmapSelection(ids, completedIds?)` | Rechaza IDs desconocidos/no publicados, duplicados y prerrequisitos ausentes o posteriores; devuelve cursos en el orden solicitado (DTOs sin envoltura HTTP) |
| `getCoursesForExistingRoadmap(ids)` | Resuelve publicados y archivados conservando el orden; rechaza borradores e IDs inexistentes (DTOs sin envoltura HTTP) |

`completedIds` debe provenir del progreso persistido y verificado del usuario, nunca de una afirmación del LLM. La validación no guarda el roadmap: Persona 2 debe crear sus relaciones y comprobar el acceso del usuario. Si necesita garantizar que no cambie el catálogo entre validación y guardado, debe hacerlo en una transacción que tome el mismo `pg_advisory_xact_lock(1789600000)` antes de validar; el catálogo no borra físicamente cursos.

El servicio interno devuelve metadatos actuales, no una instantánea histórica. Si una ruta necesita conservar títulos o descripciones de su fecha de creación, Persona 2 debe guardar esa instantánea.

`Course`, `Category` y `Technology` se exportan desde `src/catalog/entities.ts`. La migración crea solo sus tablas y relaciones; no crea usuarios, progreso, cuestionarios ni roadmaps. Al incorporar `user_technologies`, usar una FK restrictiva hacia tecnologías para que no puedan borrarse cuando estén referenciadas. Ambos módulos deben reutilizar el enum PostgreSQL `skill_level`.

`DB_SCHEMA.txt` refleja el diseño inicial, no la totalidad de las migraciones actuales. Las evaluaciones ya tienen su [propio contrato implementado](assessments.md); usuarios usan UUID. Las tablas de unión del catálogo usan claves primarias compuestas. El listado local de cursos permanece intacto y no es necesario para arrancar la API.

## Verificación

```bash
pnpm test
pnpm typecheck
pnpm lint

# PostgreSQL desechable, separado de desarrollo
docker compose -p codequest-review-test -f compose.test.yml up -d --wait
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/code_quest_test pnpm test:e2e
docker compose -p codequest-review-test -f compose.test.yml down
```

Los tests e2e exigen una URL explícita con nombre de base terminado en `_test`. Crean un esquema aleatorio propio, prueban aplicar/revertir/reaplicar la migración y lo eliminan al terminar. Nunca toman la conexión del `.env`. Si el proceso se interrumpe a la fuerza, puede quedar un esquema `catalog_test_*` en esa base desechable.

Las pruebas consumen `dist/` para conservar los metadatos de decoradores emitidos por TypeScript, igual que producción. Los comandos `test`, `test:e2e` y `test:cov` compilan antes de ejecutar. Con `test:watch`, vuelve a ejecutar `pnpm build` tras modificar `src/`.

## Unidades de revisión y reversión

| Unidad | Verificar | Límite de reversión |
| --- | --- | --- |
| Infraestructura | Arranque, entorno, CORS, docs y comandos | Bootstrap, configuración, scripts y ejemplo de entorno; conservar coherencia con importación del catálogo |
| Catálogo | Migración, HTTP, publicación, concurrencia y relaciones | `src/catalog`, migración y pruebas; retirar su importación del módulo raíz. Revertir datos solo en una base desechable |
| Integración | Contratos de LLM y conservación de archivados | Métodos internos de roadmaps y documentación asociada; mantener endpoints del catálogo |

## Integración con otros módulos

Este catálogo parte de `main` y requiere coordinar el bootstrap con los PR de infraestructura y autenticación. Mantener las migraciones, las entidades del catálogo y la validación explícita de DTOs al integrar esos cambios. No activar sincronización automática sobre esta base.

La administración usa la autenticación existente. Persona 2 debe reutilizar los UUID de usuarios y el contrato de perfiles de evaluaciones; no duplicar esas entidades.
