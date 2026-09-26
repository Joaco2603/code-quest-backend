# Roadmaps

Cada usuario guarda sus rutas de cursos publicados. El alta manual no llama a un modelo: recibe `courseIds` ya elegidos, los valida contra el catálogo y persiste el orden y el progreso. `POST /roadmaps/generate` sí llama al modelo y guarda una ruta `personal`. Las respuestas salen sin envoltorio `{ data }`.

Todas las rutas llevan el prefijo `/api` y exigen sesión completa. Un alumno lista y lee sus roadmaps `personal` y todos los `global`, pero solo edita los `personal`. Un admin solo ve y edita los roadmaps `global`. Una ruta fuera de ese alcance responde `404`.

## Alcance

La columna `roadmaps.scope` es el enum `roadmap_scope`:

| Valor | Quién lo crea | Qué lista |
| --- | --- | --- |
| `personal` | Cualquier rol que no sea admin | El dueño, en `GET /roadmaps` |
| `global` | Un admin | Cualquier admin y cualquier alumno, en `GET /roadmaps`. Solo un admin lo edita |

El alcance no viaja en el body: `POST /roadmaps` lo asigna según el rol. Los roadmaps que ya existían quedan en `personal`, salvo los cuyo dueño es admin, que pasan a `global`.

## Camino rápido

1. Elegir cursos publicados del catálogo. El contrato de validación está en [catalog](catalog.md).
2. `POST /roadmaps` con título y `courseIds` en el orden de visualización.
3. Leer `GET /roadmaps` o `GET /roadmaps/:id`.
4. Actualizar el avance con `PATCH /roadmaps/:id/courses/:courseId/progress`.
5. Un alumno guarda un roadmap `global` en su lista con `POST /roadmaps/:id/copies`. La copia es `personal`, empieza en progreso `0` y ahí mueve los porcentajes.

## Endpoints

| Método y ruta | Comportamiento |
| --- | --- |
| `POST /roadmaps` | Crea la ruta. `201` |
| `POST /roadmaps/generate` | Un alumno completa «Tu ruta personal» y recibe una ruta `personal`. El progreso de cada curso arranca en `0`. Repetir la llamada devuelve la misma ruta. Sin `OPENAI_API_KEY` responde `503` |
| `POST /roadmaps/:id/copies` | Un alumno copia un roadmap `global` a uno `personal` propio. El progreso de la copia arranca en `0`. Si ya lo había copiado, devuelve esa copia. Un admin recibe `403` |
| `GET /roadmaps` | Alumno: sus rutas `personal` y las `global`. Admin: las rutas `global`. Ordenadas por id |
| `GET /roadmaps/:id` | Una ruta con cursos hidratados |
| `PATCH /roadmaps/:id` | Cambia el título, reemplaza la lista de cursos, o ambas |
| `PATCH /roadmaps/:id/courses/:courseId/progress` | Fija el progreso de un curso de esa ruta |
| `DELETE /roadmaps/:id` | Borra la ruta y sus membresías. `200` con `{ message }` |

Alta:

```json
{
  "title": "NestJS desde cero",
  "courseIds": [1, 4, 9]
}
```

El título se recorta y admite de 1 a 200 caracteres. `courseIds` exige al menos un entero positivo, sin duplicados. Crear y reemplazar la lista toman `pg_advisory_xact_lock(1789600000)` y llaman a `validateRoadmapSelection`. Un id desconocido, no publicado, duplicado o con un prerrequisito ausente o posterior responde `400`.

Los cursos con progreso `100` se tratan como completados al reemplazar la lista, para que la validación de prerrequisitos use el avance persistido. El progreso de un curso que permanece en la lista se conserva; un curso nuevo empieza en `0`. Omitir `courseIds` en el PATCH solo renombra.

Progreso:

```json
{ "progress": 40 }
```

El valor es un entero de 0 a 100. Un `courseId` que no pertenece a la ruta responde `404`, igual que una ruta ajena o inexistente.

## Forma de la respuesta

```json
{
  "id": 3,
  "title": "NestJS desde cero",
  "scope": "personal",
  "rationale": null,
  "assessmentId": null,
  "userId": "43566ec8-22af-41d3-933a-918b536fe99f",
  "sourceRoadmapId": null,
  "courses": [
    {
      "courseId": 1,
      "progress": 40,
      "sortOrder": 0,
      "course": {}
    }
  ]
}
```

`course` es el DTO actual del catálogo, publicado o archivado, en el mismo orden que `sortOrder`. El servicio no guarda una copia histórica del título: si el catálogo cambia, la siguiente lectura muestra los metadatos vigentes. Borrar un roadmap elimina la fila; no archiva.

## Ruta personal con IA

`POST /roadmaps/generate` recibe `{ "assessmentId": 12 }` de un alumno. El intento tiene que estar completado y pertenecer al cuestionario «Tu ruta personal»:

- objetivo: aprender por interés, construir algo, conseguir trabajo o mejorar en el área
- si va a construir algo, qué quiere construir
- si quiere trabajo, de qué país es
- área, nivel actual y tecnologías que ya conoce, con el nivel en cada una

La lista de tecnologías sale de las que están en cursos del catálogo. Si todavía no hay cursos, usa el stack de respaldo. El modelo solo puede elegir cursos publicados y debe respetar prerrequisitos. La ruta queda en `personal`, nunca en `global`, y cada curso empieza con progreso `0`.

`OPENAI_API_KEY` es obligatoria para generar. `OPENAI_MODEL` (por defecto `gpt-4.1-mini`) y `OPENAI_TIMEOUT_MS` son opcionales.
