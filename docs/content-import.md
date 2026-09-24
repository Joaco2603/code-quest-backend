# Cargar los cursos y el cuestionario inicial

El importador utiliza `COURSES.json` o `COURSES.enriched.json`. Conserva los datos del curso y lo crea **en borrador**. Del bloque `enrichment` solo se copian el nivel y las tecnologías con procedencia `curated`. Imagen y duración quedan vacías: un administrador debe completarlas con información verificada antes de publicar.

## Revisar y aplicar

```bash
# Compila y valida el archivo sin conectar a PostgreSQL
pnpm content:import COURSES.json

# Aplica las migraciones al entorno configurado en .env
pnpm migration:run

# Carga explícita en ese entorno
pnpm content:import COURSES.json --apply
```

La importación exige que no haya migraciones pendientes. No se ejecuta al arrancar la API y no crea usuarios ni modifica roles. El resumen sin `--apply` incluye `curatedOnCreate` (cuántos cursos recibirán nivel o tecnologías) y `missingPublicationFields` (campos que todavía impiden publicar al menos un curso).

Fuente revisada el 21 de septiembre de 2026: **82 registros, 74 con enlace de DevTalles y 8 omitidos por no tenerlo**. Se usa `plataformas.devtalles` (o `devtalles` si existe como campo directo), no el enlace a Udemy ni la página del instructor. Esta validación comprueba estructura, host y campos del archivo; no certifica la disponibilidad actual de cada enlace.

## Qué se carga

| Contenido | Comportamiento |
| --- | --- |
| Cursos | Título, descripción, instructor, enlace y categoría suministrados; estado `draft`. Nivel y tecnologías se copian al crear el curso solo si su procedencia es `curated` |
| Categorías | Se reutilizan nombres existentes sin distinguir mayúsculas ni espacios exteriores |
| Tecnologías | Vocabulario inicial para el cuestionario: JavaScript, TypeScript, React, Angular, Vue, NestJS, Node.js, Flutter, Docker, SQL y Python. Las tecnologías curadas del archivo se crean para ese curso y no se agregan al cuestionario |
| Cuestionario | Áreas de interés y objetivo obligatorios; tecnologías de interés y nivel declarado opcionales |
| Reglas | Mapeos a IDs reales de la instalación y opciones de nivel desconocido |

Las tecnologías iniciales son una selección editorial para la autoevaluación; no se asignan automáticamente a cursos. El nivel inferido y los datos scrapeados no se copian. Las preguntas requieren intereses y objetivo; las once preguntas de nivel permiten responder `No sé / prefiero no responder`.

## Repetición y cambios posteriores

La URL normalizada de DevTalles identifica cada curso en `content_imports`. El cuestionario utiliza la clave estable `codequest:self-assessment:v1`. La operación completa utiliza una transacción y el lock de escritura del catálogo.

- Volver a ejecutar omite cursos ya importados y conserva el cuestionario existente.
- Los cursos ya importados conservan su estado administrativo: el enriquecido solo se aplica al crearlos, nunca sobrescribe ediciones posteriores.
- Los cambios administrativos posteriores no se sobrescriben, incluso si se modificó la URL de un curso importado.
- Si un curso ya existía con esa URL antes de la primera importación, se vincula su procedencia sin modificarlo. Varias coincidencias abortan la importación para que el administrador resuelva la ambigüedad.
- Nuevas categorías en el archivo se crean, pero no se agregan silenciosamente al cuestionario ya editado. Actualizar sus opciones y reglas mediante los endpoints administrativos.
- Cambiar el enlace de un registro en el archivo puede identificar otro curso. Revisar ese cambio antes de aplicar para evitar duplicados semánticos.

## Completar y publicar

Un administrador con sesión completa debe revisar cada curso. Si la importación usó `COURSES.enriched.json`, el nivel y las tecnologías curados ya pueden estar cargados; hay que completar `imageUrl` y `durationMinutes` con información verificada y asignar prerrequisitos. Usar `PATCH /api/admin/courses/:id`; después, `POST /api/admin/courses/:id/publish`.

Publicar primero los prerrequisitos. El backend mantiene sus validaciones de metadatos y ciclos. No se inventan duraciones ni se publican borradores automáticamente. Hasta que se completen cursos compatibles, el generador de Persona 2 no tendrá contenido elegible aunque el perfil del usuario esté listo.

## Cuenta administradora

Usar una cuenta administradora existente y completar su 2FA. Si es una instalación nueva, el responsable de la base debe promover explícitamente una cuenta registrada y verificada mediante el procedimiento operativo del equipo, identificándola por UUID. Luego debe iniciar sesión de nuevo y completar la inscripción de 2FA requerida para administradores. El registro público no acepta roles privilegiados y el importador no agrega credenciales ni cuentas administrativas.

## Reversión

La carga inicial no tiene un borrado masivo automático. En desarrollo, descartar una base de pruebas es la forma de deshacer una prueba de carga; en una base persistente, archivar cursos o desactivar el cuestionario mediante la API conserva los historiales. Revertir la migración `CreateContentImports` elimina las marcas de importación, no sus cursos ni cuestionarios, por lo que se debe revisar una posterior recarga para evitar duplicar el cuestionario.
