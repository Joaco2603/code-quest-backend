# Rutas de aprendizaje

El generador arma una ruta a partir de una evaluación propia y del catálogo publicado. OpenAI elige cursos; el servidor decide si esa elección es válida y solo entonces la guarda.

No usa base vectorial. El catálogo es un conjunto cerrado de cursos, no un corpus de documentos. Buscar por similitud añadiría embeddings, reindexado y una forma nueva de omitir un curso. En su lugar, el servidor filtra por intereses y habilidades, incluye los prerrequisitos publicados de esos cursos y envía esa lista acotada al modelo. La salida solo puede contener IDs de esa lista.

## Generar

`POST /api/roadmaps/generate` requiere sesión completa.

```json
{ "assessmentId": 8 }
```

Respuesta `201`:

```json
{
  "data": {
    "id": 4,
    "title": "APIs con NestJS",
    "rationale": "Empieza por TypeScript y sigue con APIs en NestJS.",
    "assessmentId": 8,
    "createdAt": "2026-09-23T18:00:00.000Z",
    "courses": [
      {
        "courseId": 1,
        "progress": 0,
        "sortOrder": 0,
        "course": { "id": 1, "title": "TypeScript" }
      }
    ]
  }
}
```

En el ejemplo, `course` está abreviado. La respuesta real incluye el curso serializado del catálogo. `GET /api/roadmaps` y `GET /api/roadmaps/:id` devuelven las rutas del usuario autenticado. Una ruta ajena responde `404`.

| Estado | Cuándo |
| --- | --- |
| `409` | El perfil no tiene interés y objetivo, ningún curso publicado coincide, o el catálogo cambió durante la generación |
| `502` | OpenAI no respondió o ninguna corrección produjo cursos utilizables |
| `503` | Falta `OPENAI_API_KEY` |

## Cómo se elige

1. `AssessmentsService.getProfileForUser` exige un perfil propio listo para generar. Los objetivos llegan al modelo como datos, dentro del mensaje de usuario, y el prompt de sistema pide ignorar instrucciones escritas ahí.
2. `selectCandidates` se queda con cursos publicados que comparten categoría, tecnología de interés o tecnología con habilidad declarada. Añade sus prerrequisitos publicados y corta la lista en 40 cursos, salvo que el primer match necesite más prerrequisitos para cerrar.
3. OpenAI responde un JSON con `title`, `rationale` y `courseIds` (1 a 8). Si el orden o los IDs no sirven, hay un segundo intento con el error. Si ese también falla, se conserva el prefijo válido; si no queda ninguno, la petición termina en `502`.
4. Dentro de una transacción con `pg_advisory_xact_lock(1789600000)`, `validateRoadmapSelection` vuelve a comprobar IDs publicados, unicidad y prerrequisitos. `completedIds` va vacío: todavía no hay progreso persistido, y no se acepta lo que diga el modelo.

Cada generación crea otra ruta. No reemplaza las anteriores.

## Configuración

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TIMEOUT_MS=25000
```

La clave solo hace falta al generar. El modelo y el tiempo de espera tienen esos valores por defecto. Después de actualizar el código, aplica la migración con `pnpm migration:run`.

Las tablas son `roadmaps` (usuario, evaluación, título, justificación y modelo) y `roadmap_courses` (curso, orden y progreso en 0). Borrar el usuario o la evaluación elimina sus rutas. Un curso referenciado no se puede borrar físicamente.

## Verificación

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Las pruebas del plan y del filtro no llaman a OpenAI. La suite PostgreSQL descrita en el [catálogo](catalog.md#verificación) aplica también esta migración.
