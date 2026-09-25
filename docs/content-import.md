# Cargar los cursos y el cuestionario inicial

El importador utiliza `COURSES.enriched.json`. Conserva los datos del curso y lo crea **en borrador**. Los campos `level`, `technologyNames`, `imageUrl` y `durationMinutes` de cada curso son la verdad curada y se copian al crearlo. Los metadatos crudos (`durationHoursRaw`, `lessonsRaw`) nunca se copian: no se infieren duraciones ni se inventan imágenes o tecnologías.

La validación del archivo comprueba **formato**, no corrección: una imagen con URL válida o una duración dentro de rango pueden igual estar desactualizadas. Verificar contra la página oficial antes de publicar.

## Revisar y aplicar

Como los cursos aún no fueron importados, el camino es un solo comando por paso:

```bash
# Compila y valida el archivo sin conectar a PostgreSQL
pnpm content:import COURSES.enriched.json

# Planificación con consultas de solo lectura (no escribe)
pnpm content:import COURSES.enriched.json --plan --fill-missing --publish-ready

# Aplica las migraciones al entorno configurado en .env
pnpm migration:run

# Pipeline completo: importar + completar vacíos + publicar los listos
pnpm content:import COURSES.enriched.json --apply --fill-missing --publish-ready
```

Los flags `--fill-missing` y `--publish-ready` también funcionan por separado para corridas posteriores (ver abajo); sin flags, `--apply` solo importa en borrador, como siempre.

La importación exige que no haya migraciones pendientes. No se ejecuta al arrancar la API y no crea usuarios ni modifica roles. El resumen sin `--apply` incluye `curatedOnCreate` (cuántos cursos recibirán nivel, tecnologías, imagen o duración) y `missingPublicationFields` (campos que todavía impiden publicar al menos un curso).

Fuente revisada el 21 de septiembre de 2026: **82 registros, 74 con enlace de DevTalles y 8 omitidos por no tenerlo**. Se usa `plataformas.devtalles` (o `devtalles` si existe como campo directo), no el enlace a Udemy ni la página del instructor. Los 74 tienen `imageUrl`, `durationMinutes` y `level`; 71 tienen `technologyNames`. Tres no tienen tecnologías y no se publican hasta asignarlas manualmente: “Principios: SOLID y Clean Code”, “Patrones de Diseño: Soluciones prácticas y eficientes” y “Programación para principiantes”. Esta validación comprueba estructura, host y campos del archivo; no certifica la disponibilidad actual de cada enlace ni la corrección de cada dato.

## Qué se carga

| Contenido    | Comportamiento                                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursos       | Título, descripción, instructor, enlace y categoría suministrados; estado `draft`. Nivel, tecnologías, imagen y duración del archivo se copian al crear el curso                                                                   |
| Categorías   | Se reutilizan nombres existentes sin distinguir mayúsculas ni espacios exteriores                                                                                                                                                  |
| Tecnologías  | Vocabulario inicial para el cuestionario: JavaScript, TypeScript, React, Angular, Vue, NestJS, Node.js, Flutter, Docker, SQL y Python. Las tecnologías curadas del archivo se crean para ese curso y no se agregan al cuestionario |
| Cuestionario | Áreas de interés y objetivo obligatorios; tecnologías de interés y nivel declarado opcionales                                                                                                                                      |
| Reglas       | Mapeos a IDs reales de la instalación y opciones de nivel desconocido                                                                                                                                                              |

Las tecnologías iniciales son una selección editorial para la autoevaluación; no se asignan automáticamente a cursos. Las preguntas requieren intereses y objetivo; las once preguntas de nivel permiten responder `No sé / prefiero no responder`.

## Repetición y cambios posteriores

La URL normalizada de DevTalles identifica cada curso en `content_imports`. El cuestionario utiliza la clave estable `codequest:self-assessment:v1`. La operación completa utiliza una transacción y el lock de escritura del catálogo.

- Volver a ejecutar omite cursos ya importados y conserva el cuestionario existente.
- Los cursos ya importados conservan su estado administrativo: el enriquecido solo se aplica al crearlos, nunca sobrescribe ediciones posteriores.
- Los cambios administrativos posteriores no se sobrescriben, incluso si se modificó la URL de un curso importado.
- Si un curso ya existía con esa URL antes de la primera importación, se vincula su procedencia sin modificarlo. Varias coincidencias abortan la importación para que el administrador resuelva la ambigüedad.
- Nuevas categorías en el archivo se crean, pero no se agregan silenciosamente al cuestionario ya editado. Actualizar sus opciones y reglas mediante los endpoints administrativos.
- Cambiar el enlace de un registro en el archivo puede identificar otro curso. Revisar ese cambio antes de aplicar para evitar duplicados semánticos.

## Completar vacíos (`--fill-missing`)

Opción explícita para completar cursos ya importados sin sobrescribir ediciones:

- Resuelve primero por la procedencia registrada en `content_imports`, por lo que sigue funcionando aunque un administrador haya cambiado la URL del curso.
- Las coincidencias por URL (sin marca previa) mantienen el comportamiento actual: solo vinculan procedencia, no se modifican. Los casos ambiguos abortan igual que siempre.
- Completa únicamente campos vacíos (`imageUrl`, `durationMinutes`, `level`, `description`, `instructor`, categoría y tecnologías); conserva valores existentes, estado y prerrequisitos.
- Asigna las tecnologías del archivo solo cuando el curso no tiene ninguna.
- Mantiene transacción, lock del catálogo e idempotencia. Sin este flag, las reimportaciones se comportan exactamente como antes.

## Publicación explícita (`--publish-ready`)

- Limitada a los cursos identificados por este archivo (creados en esta corrida o resueltos por procedencia). Los cursos recién vinculados por URL no se publican automáticamente.
- Publica únicamente borradores completos, usando las mismas reglas del catálogo (`src/catalog/publication.ts`, compartidas con `CatalogService`): no hay un `UPDATE` de estado que evite sus validaciones.
- Publica cadenas de prerrequisitos en orden (varias pasadas); si un prerrequisito no está publicado, el dependiente queda en borrador con motivo `unpublishedPrerequisites`.
- Conserva cursos archivados (motivo `archived`) y deja incompletos en borrador con sus campos faltantes.
- No inventa tecnologías para los tres cursos pendientes: quedan en borrador con motivo `technologyIds`.

## Vista previa útil

El modo sin `--apply` ni `--plan` sigue sin conectar a la DB. Para revisar cambios sobre cursos existentes:

```bash
pnpm content:import COURSES.enriched.json --plan --fill-missing --publish-ready
```

Muestra por curso: los que se crearían, los campos vacíos que se completarían, los que se publicarían y los omitidos o bloqueados con sus motivos. El plan usa solo consultas de lectura (sin lock ni transacción de escritura). `--apply` es necesario para escribir, y la ejecución real vuelve a leer el estado de la DB dentro de su transacción, por lo que un plan puede quedar desactualizado.

## Operación en el VPS

Un solo comando por paso (el pipeline completo va fijo en `--apply`):

```bash
./scripts/import-content-vps.sh                  # vista previa (dry-run)
./scripts/import-content-vps.sh --plan            # planificación con DB
./scripts/import-content-vps.sh --apply           # backup + importar + completar + publicar listos
```

El script opera sobre la release activa (`/srv/apps/codequest/current`) con su imagen ya construida, sin recompilar. Monta el JSON como archivo de solo lectura (`:ro`). Comprueba migraciones pendientes con `migration:show` y se detiene con explicación si hay alguna. Antes de escribir crea un backup con permisos restringidos (`umask 077`), verifica que `pg_dump` terminó con contenido y que `pg_restore --list` puede leerlo; si el backup falla, se detiene sin escribir. Informa solo la presencia de `OPENAI_API_KEY` (nunca su valor); si falta, la generación de roadmaps con IA responde `503` pero la importación sigue. No ejecuta migraciones ni borrados.

## Selección verificada para la demo

Imagen (`og:image` exacto) y duración (horas publicadas × 60) verificadas el 2026-09-25 contra las páginas oficiales de DevTalles. Nivel, tecnologías e instructor se toman del archivo sin verificación independiente.

| Curso                                                       | Imagen     | Duración          |
| ----------------------------------------------------------- | ---------- | ----------------- |
| Nest: Desarrollo backend escalable con Node                 | verificada | 1470 min (24.5 h) |
| Nuxt: El marco de trabajo web progresivo (Nuxt 4+)          | verificada | 810 min (13.5 h)  |
| Docker: Guía práctica de uso para desarrolladores           | verificada | 840 min (14 h)    |
| GIT+GitHub: Todo un sistema de control de versiones de cero | verificada | 690 min (11.5 h)  |
| Laravel 13: AI, REST, JWT, Repository Pattern               | verificada | 810 min (13.5 h)  |
| Claude Code: Guía completa para desarrolladores de software | verificada | 1050 min (17.5 h) |

Pendiente: verificar imagen y duración de los 68 cursos restantes antes de publicarlos, y asignar tecnologías a los 3 cursos sin ellas. Nada fuera de esta tabla se presenta como verificado.

## Completar y publicar (manual)

Un administrador con sesión completa debe revisar cada curso. Si la importación usó `COURSES.enriched.json`, el nivel, las tecnologías, la imagen y la duración curados ya pueden estar cargados; hay que verificarlos contra la página oficial y asignar prerrequisitos. Usar `PATCH /api/admin/courses/:id`; después, `POST /api/admin/courses/:id/publish`.

Publicar primero los prerrequisitos. El backend mantiene sus validaciones de metadatos y ciclos. No se inventan duraciones ni se publican borradores automáticamente. Hasta que se completen cursos compatibles, el generador de Persona 2 no tendrá contenido elegible aunque el perfil del usuario esté listo.

## Cuenta administradora

Usar una cuenta administradora existente y completar su 2FA. Si es una instalación nueva, el responsable de la base debe promover explícitamente una cuenta registrada y verificada mediante el procedimiento operativo del equipo, identificándola por UUID. Luego debe iniciar sesión de nuevo y completar la inscripción de 2FA requerida para administradores. El registro público no acepta roles privilegiados y el importador no agrega credenciales ni cuentas administrativas.

## Reversión

La carga inicial no tiene un borrado masivo automático. En desarrollo, descartar una base de pruebas es la forma de deshacer una prueba de carga; en una base persistente, archivar cursos o desactivar el cuestionario mediante la API conserva los historiales. Revertir la migración `CreateContentImports` elimina las marcas de importación, no sus cursos ni cuestionarios, por lo que se debe revisar una posterior recarga para evitar duplicar el cuestionario.
