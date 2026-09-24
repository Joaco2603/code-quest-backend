# Roadmaps

Cada usuario guarda sus rutas de cursos publicados. El módulo no llama a un modelo: recibe `courseIds` ya elegidos, los valida contra el catálogo y persiste el orden y el progreso. Las respuestas salen sin envoltorio `{ data }`.

Todas las rutas llevan el prefijo `/api`, exigen sesión completa y operan solo sobre las rutas del usuario autenticado. Una ruta de otra persona responde `404`.

## Camino rápido

1. Elegir cursos publicados del catálogo. El contrato de validación está en [catalog](catalog.md).
2. `POST /roadmaps` con título y `courseIds` en el orden de visualización.
3. Leer `GET /roadmaps` o `GET /roadmaps/:id`.
4. Actualizar el avance con `PATCH /roadmaps/:id/courses/:courseId/progress`.

## Endpoints

| Método y ruta | Comportamiento |
| --- | --- |
| `POST /roadmaps` | Crea la ruta. `201` |
| `GET /roadmaps` | Lista las rutas del usuario, ordenadas por id |
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
  "rationale": null,
  "assessmentId": null,
  "createdAt": "2026-09-24T12:00:00.000Z",
  "userId": "43566ec8-22af-41d3-933a-918b536fe99f",
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

`rationale` y `assessmentId` son `null` en una ruta creada a mano. `createdAt` es la fecha de alta. Una ruta generada conserva la explicación y el id de la evaluación en estas mismas lecturas.

## Generación con IA

`POST /api/roadmaps/generate` recibe `{ "assessmentId": 123 }`. El ID debe
pertenecer a una evaluación del usuario autenticado enviada al nuevo
`POST /api/assessments`. Devuelve `{ data: { id, title, rationale, assessmentId,
createdAt, courses } }`. El CRUD y el progreso por curso conservan sus rutas y,
en la lectura, los mismos `rationale`, `assessmentId` y `createdAt`.

Configura `OPENAI_API_KEY` y, opcionalmente, `OPENAI_MODEL` y
`OPENAI_TIMEOUT_MS`. Sin clave, la generación devuelve 503. El backend valida
que la selección use cursos publicados y respete sus prerrequisitos antes de
persistirla. La prueba de integración usa un cliente simulado; no consume la API.

Ver [el flujo de evaluaciones](assessments.md) y [la integración de ramas](integracion-pendientes.md).
