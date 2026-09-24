# Cuestionarios

> El flujo de intentos y respuestas parciales fue reemplazado. Para integrar el frontend, usa [evaluaciones](assessments.md); ver [notas de integración](integracion-pendientes.md).

El módulo `questions` administra cuestionarios: alta administrativa y contrato HTTP común. El flujo de evaluación del estudiante está en [evaluaciones](assessments.md).

Todas las rutas llevan el prefijo `/api` y exigen una sesión completa.

## Camino rápido

1. Un `admin` crea el cuestionario con `POST /questionnaires`.
2. Agrega preguntas con `POST /questionnaires/:id/questions` y opciones con `POST /questions/:id/options`.
3. Un `user` lista activos con `GET /questionnaires/active` y sigue el flujo de intentos de la guía adaptativa.

## Administración

| Método y ruta | Quién | Comportamiento |
| --- | --- | --- |
| `POST /questionnaires` | `admin` | Crea con `{ title, description? }`. `201`, `{ data }` |
| `GET /questionnaires` | `admin` | Listado paginado, incluye inactivos |
| `GET /questionnaires/:id` | `admin` | Detalle completo, incluye inactivos |
| `PATCH /questionnaires/:id` | `admin` | Actualiza título, descripción o estado |
| `DELETE /questionnaires/:id` | `admin` | Desactiva (`is_active=false`). No borra la fila |
| `POST /questionnaires/:id/questions` | `admin` | Agrega una pregunta |
| `PATCH /questions/:id` | `admin` | Reemplaza el texto, el tipo, el orden o `rules` |
| `DELETE /questions/:id` | `admin` | Desactiva la pregunta |
| `POST /questions/:id/options` | `admin` | Agrega una opción |
| `PATCH /answer-options/:id` | `admin` | Edita una opción |
| `DELETE /answer-options/:id` | `admin` | Borra la opción |

Tipos de pregunta: `single_choice`, `multiple_choice`, `text`, `number`, `boolean`.

Alta de pregunta:

```json
{
  "question": "¿Qué querés lograr?",
  "type": "single_choice",
  "sortOrder": 0,
  "rules": { "required": true, "allowDetails": true },
  "options": [{ "label": "Trabajo", "value": "job", "sortOrder": 0 }]
}
```

`rules` se reemplaza entero. `{}` vuelve al comportamiento obligatorio de siempre. Las condiciones `showWhen` solo pueden apuntar a una opción de una pregunta activa, sin condición, del mismo cuestionario. No se admiten ciclos ni cadenas. Desactivar una pregunta padre, o borrar una opción usada por una condición activa, se rechaza.

Las lecturas y escrituras administrativas responden `{ data }` o `{ data, meta }`. Desactivar un cuestionario o una pregunta conserva las respuestas ya guardadas.

## Lectura para quien responde

| Método y ruta | Comportamiento |
| --- | --- |
| `GET /questionnaires/active` | Cuestionarios activos, sin preguntas. `{ data: [...] }` |
| `GET /questionnaires/active/:id` | Cuestionario activo con las preguntas que no tienen `showWhen` |

Cualquier rol con sesión completa puede leer los activos. El intento en sí exige rol `user` y vive en `/assessments`: crear, listar, responder, quitar una respuesta y completar. Esos cuerpos no usan envoltorio `data`. El detalle de selección máxima, niveles desconocidos y concurrencia está en la guía adaptativa.

## Errores

`400` para cuerpos inválidos, reglas cíclicas o respuestas que todavía no aplican. `403` si el rol no alcanza. `404` si el cuestionario no existe, está inactivo para una lectura pública, o el intento es de otra persona. `409` si ya hay un intento incompleto del mismo cuestionario, o si se modifica uno completado.
