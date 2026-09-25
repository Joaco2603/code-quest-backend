# Integración frontend — Evaluaciones y rutas con IA

Guía paso a paso para integrar el flujo completo en el frontend: responder un
cuestionario, generar una ruta con IA y mostrarla. Base: `https://<host>/api`.
Contrato vivo en `/api/docs` y `/api/docs-json`.

Convenciones globales: todo éxito viene envuelto una sola vez (`{ data }` o
`{ data, meta: { total, limit, offset } }`); los errores van sin envoltorio
(`{ statusCode, message }`). Los DTOs rechazan campos desconocidos.

## Paso 0 — Autenticación

```http
POST /api/auth/register
{ "email": "a@a.com", "password": "Password1!", "first_name": "Ada", "last_name": "Lovelace" }
→ { "data": { "user": {...}, "accessToken": "eyJ..." } }

POST /api/auth/login
{ "email": "a@a.com", "password": "Password1!" }
→ { "data": { "user": {...}, "accessToken": "eyJ..." } }
```

La contraseña exige 8–20 caracteres con mayúscula, minúscula y número o
símbolo. Todo lo demás usa `Authorization: Bearer <accessToken>`.

## Paso 1 — Listar cuestionarios

```http
GET /api/questionnaires/active   → { "data": [...] }
```

Elegir un `id` de la lista.

## Paso 2 — Traer el formulario

```http
GET /api/questionnaires/<id>/evaluation
→ { "data": { "revision": "sha256…", "questionnaire": { "questions": [...] }, ... } }
```

Renderizar las preguntas desde esta respuesta. Valor esperado por tipo:

| type | `value` |
| --- | --- |
| `single_choice` | ID de la opción (número) |
| `multiple_choice` | array de IDs |
| `text` / `number` / `boolean` | valor nativo |

## Paso 3 — Enviar la evaluación

```http
POST /api/assessments
{
  "questionnaireId": 1,
  "revision": "<exactamente el del paso 2>",
  "answers": [
    { "questionId": 1, "value": 1 },
    { "questionId": 4, "value": [17, 21] }
  ]
}
→ { "data": { "profile": { "assessmentId": 1, "readyForGeneration": true, ... } } }
```

- Sin campos extra, sin IDs duplicados y sin valores fuera de rango: todo eso
  es `400`.
- Si `readyForGeneration` es `false`, falta al menos un interés y un objetivo.
  Pedir al usuario que complete y reenviar.
- Guardar el `assessmentId` para el paso siguiente.

## Paso 4 — Generar la ruta

```http
POST /api/roadmaps/generate
{ "assessmentId": 1 }
→ { "data": {
    "id": 1, "title": "...", "rationale": "...", "assessmentId": 1,
    "createdAt": "2026-09-25T22:41:56.491Z",
    "courses": [{ "courseId": 1, "progress": 0, "sortOrder": 0,
                   "course": { "id": 1, "title": "...", "level": "beginner",
                               "categories": [...], "technologies": [...],
                               "prerequisiteIds": [...] } }]
} }
```

Requisitos del cliente, en orden de importancia:

1. **Timeout largo.** La generación tarda (nube ~10–25s; modelo local con
   razonamiento ~40s o más). Usar timeout de **120s**, estado de carga
   visible y **sin reintentos automáticos**.
2. **Sin idempotencia.** Cada llamada crea una ruta nueva. Deshabilitar el
   botón mientras genera.
3. **Orden.** Mostrar los cursos por `sortOrder`; los prerrequisitos ya
   vienen antes que sus dependientes.

## Paso 5 — CRUD de rutas

```http
GET    /api/roadmaps                              → rutas del usuario
GET    /api/roadmaps/<id>                         → detalle con cursos hidratados
PATCH  /api/roadmaps/<id>                         → { "title"?, "courseIds"? }
PATCH  /api/roadmaps/<id>/courses/<courseId>/progress → { "progress": 0–100 }
DELETE /api/roadmaps/<id>
```

Las rutas son privadas por usuario: una ruta ajena o inexistente es `404`.

## Errores y acción sugerida

| Código | Caso | Acción |
| --- | --- | --- |
| `400` | DTO inválido | mostrar `message`, no reintentar igual |
| `401` | token ausente o expirado | re-login |
| `404` | ruta ajena o inexistente | volver al listado |
| `409` | `revision` desactualizado | re-pedir el formulario (paso 2) y reenviar |
| `409` | cuestionario sin evaluación configurada | mostrar "no disponible", es tema admin |
| `409` | sin cursos publicados para ese perfil | sugerir responder con otros intereses |
| `502` | el modelo devolvió algo inusable | botón "Reintentar" manual, con espera |
| `503` | generación no configurada en el backend | error de configuración, no del usuario |

Ver también [roadmaps](roadmaps.md), [assessments](assessments.md) y
[auth](auth.md).
