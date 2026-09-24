# Cuestionario adaptativo

El cuestionario muestra **4 preguntas iniciales y hasta 3 autoevaluaciones**. El backend calcula las preguntas aplicables a partir de las respuestas guardadas. El frontend debe usar el flujo indicado abajo para que el usuario no vea todas las preguntas configuradas.

## Preguntas

| Pregunta | Respuesta | Obligatoria |
| --- | --- | --- |
| ¿Qué querés lograr? | Trabajo, proyecto, mejorar, explorar u otro; detalle opcional de hasta 1000 caracteres | Sí |
| ¿Qué área te interesa? | Frontend, backend, móvil, bases de datos, infraestructura o «Todavía no sé» | Sí |
| ¿Qué experiencia tenés programando? | Nunca programé, ejercicios/cursos, proyectos o experiencia profesional | Sí |
| ¿Qué tecnologías te gustaría aprender? | Selección de hasta 3 tecnologías | No |
| ¿Cuál es tu experiencia con cada tecnología elegida? | Nunca la usé, ejercicios, proyectos, uso profesional o «No sé evaluar mi nivel» | Solo si se elige esa tecnología |

El cuestionario almacena 18 preguntas condicionales, pero cada intento muestra entre cero y tres. Flutter está entre las tecnologías; móvil es una sola área. No se pregunta un nivel genérico de «IA» o «Herramientas».

La experiencia general no reemplaza el nivel por tecnología. La opción `unknown` significa que el usuario no sabe evaluar su nivel; una tecnología omitida no representa conocimiento nulo ni nivel principiante. El generador de rutas con IA debe conservar esa distinción. Esta implementación entrega las respuestas; no incorpora un proveedor ni un generador de IA.

## Integración del frontend

Todas las rutas llevan el prefijo `/api` y requieren un token de acceso válido. Las rutas de intentos requieren rol `user`.

1. Consultar `GET /questionnaires/active` y usar el `id` del cuestionario que se desea responder (el nuevo se titula «Tu próxima ruta de aprendizaje»). La respuesta es `{ data: [...] }`. No fijar un ID numérico: depende de la base.
2. `GET /questionnaires/active/:id` devuelve `{ data: cuestionario }` con las cuatro preguntas iniciales. El listado de activos no carga preguntas.
3. Crear el intento con `POST /assessments`, cuerpo `{ "questionnaireId": 123 }`. Si existe uno incompleto, retomarlo desde `GET /assessments` en lugar de crear otro.
4. Guardar cada respuesta con `PUT /assessments/:id/answers`. Para una opción, enviar `questionId` y `answerOptionId`; para tecnologías, `questionId` y `answerOptionIds`.
5. Tras guardar o quitar una respuesta, consultar `GET /assessments/:id/questionnaire`. Renderizar su arreglo `questions`: ya contiene exclusivamente las preguntas aplicables, ordenadas. Al retomar, obtener también `GET /assessments/:id` para completar los valores guardados.
6. Para quitar toda la selección opcional, usar `DELETE /assessments/:id/answers/:questionId`. Un arreglo vacío en el PUT sigue siendo inválido. Cambiar la selección elimina automáticamente las autoevaluaciones de tecnologías deseleccionadas; quitarlas todas vuelve a cuatro preguntas.
7. Finalizar con `POST /assessments/:id/complete`. Se puede completar con las tres respuestas base obligatorias y ninguna tecnología. Si hay tecnologías seleccionadas, deben tener autoevaluación. Un intento completado ya no permite cambios ni borrados de respuestas.

Los endpoints `/assessments` conservan el contrato existente: devuelven el objeto directamente, sin envoltorio `data`. El nuevo GET del cuestionario del intento también devuelve el cuestionario directamente.

Ejemplo de objetivo con detalle (IDs ilustrativos):

```json
{
  "questionId": 101,
  "answerOptionId": 201,
  "value": "Quiero construir mi primer portfolio"
}
```

Una selección de cuatro tecnologías o una respuesta a una pregunta que todavía no aplica devuelve `400`. Un intento de otra persona devuelve `404`; modificar uno completado devuelve `409`.

## Reglas y conservación de datos

Las preguntas exponen `rules`: `required` (por defecto `true`), `maxSelections`, `allowDetails` y `showWhen: { questionId, answerOptionId }`. Las condiciones solo pueden referenciar opciones de una pregunta activa, sin condición, del mismo cuestionario. No se admiten ciclos ni cadenas. Las operaciones administrativas rechazan desactivar una pregunta padre o eliminar una opción que use una condición activa.

El PATCH administrativo de una pregunta reemplaza todo el objeto `rules`; `{}` restaura el comportamiento obligatorio tradicional. Para nuevas versiones con intentos existentes, crear otro cuestionario en vez de editar sus preguntas.

La migración `1789600005000-AdaptiveQuestionnaire` agrega las reglas y crea un cuestionario nuevo. No cambia preguntas ni respuestas anteriores. La versión anterior sigue activa para permitir retomar sus intentos; el frontend usa el `id` del cuestionario elegido, sin un identificador adicional de versión.

Reemplazar respuestas, limpiar niveles condicionales y completar un intento ocurre en transacciones con bloqueo por intento. Un fallo de escritura revierte el cambio completo. La reversión de la migración se rechaza si la nueva versión tiene intentos; aun sin ellos, debe reservarse para bases desechables porque elimina la columna de reglas agregada. La reversión identifica el cuestionario por su título y descripción originales; si se cambiaron o hay más de una coincidencia, se detiene sin borrar datos.

## Activación y pruebas

Sobre una base compatible con las migraciones actuales de `main`:

```bash
pnpm migration:run
pnpm start:dev
```

Después, actualizar el frontend para usar el `id` del cuestionario elegido y consultar las preguntas del intento. La API por sí sola no modifica una pantalla que tenga fijado el cuestionario anterior.

**Estado del entorno local revisado:** su historial contiene `CreateAssessments1789948800000` y `CreateContentImports1789948801000`, correspondientes a otra implementación. Su tabla `assessments` tiene `snapshot` y `profile`, mientras que esta rama usa la secuencia de migraciones de `main` y requiere, entre otros campos, `created_at`. No ejecutar todas las migraciones de esta rama sobre esa base sin reconciliar previamente ambos esquemas. No se alteró la base local existente. La nueva migración y el flujo HTTP se verifican en PostgreSQL desechable.

Verificación:

```bash
pnpm test
pnpm typecheck
pnpm lint
docker compose -p codequest-adaptive-test -f compose.test.yml up -d --wait
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/code_quest_test pnpm test:e2e
docker compose -p codequest-adaptive-test -f compose.test.yml down
```

Las pruebas cubren reglas y DTOs, migrar/revertir/migrar conservando preguntas anteriores, 4–7 preguntas visibles, selección máxima, objetivo con detalle, nivel desconocido, limpieza al cambiar intereses, permisos, intentos completados, concurrencia y reversión de una escritura fallida.
