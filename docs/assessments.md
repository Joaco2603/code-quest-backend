# Evaluaciones de habilidades e intereses

El usuario responde un cuestionario completo y obtiene un perfil persistido para el generador de rutas con IA. El nivel es **autoevaluado**: `self_reported` significa declaración del usuario, no una prueba técnica. Un nivel desconocido se representa con `level: null` y `source: "unknown"`.

## Puesta en marcha

1. Aplicar las migraciones con `pnpm migration:run` en la base configurada para el entorno.
2. Revisar la importación: `pnpm content:import COURSES.enriched.json` no abre una conexión ni escribe datos.
3. Cargar el contenido explícitamente: `pnpm content:import COURSES.enriched.json --apply`.
4. Iniciar la API, ingresar y consultar `GET /api/questionnaires/active`.
5. Obtener el formulario de evaluación, responderlo y enviar su `revision` junto con las respuestas.

La carga crea un cuestionario inicial, reglas de autoevaluación, categorías y tecnologías. Los cursos quedan como borradores hasta completar los metadatos de publicación. Ver [carga de contenido](content-import.md).

## Endpoints

Todos requieren `Authorization: Bearer <accessToken>` con sesión completa. No sirven tickets de Discord ni tokens temporales de 2FA o recuperación.

| Método | Ruta | Acceso y respuesta |
| --- | --- | --- |
| `GET` | `/api/questionnaires/:id/evaluation` | Usuario autenticado; `{data:{questionnaire, definition, profileVersion, revision}}` |
| `PUT` | `/api/questionnaires/:id/evaluation` | Administrador; reemplaza reglas e incrementa la versión; `{data:{questionnaireId, profileVersion, definition}}` |
| `POST` | `/api/assessments` | Guarda respuestas y perfil del usuario autenticado; `201`, `{data:{profile, snapshot, answers}}` |
| `GET` | `/api/assessments?limit=20&offset=0` | Perfiles propios, ordenados del más reciente al más antiguo; `{data,meta:{total,limit,offset}}` |
| `GET` | `/api/assessments/:id` | Evaluación propia con copia histórica, respuestas y perfil; `{data:{profile,snapshot,answers}}` |

`limit` admite 1–100; `offset`, 0–1000000. Una evaluación ajena devuelve `404`. No hay envío parcial ni edición de una evaluación completada: un nuevo envío válido crea otra evaluación.

## Responder el cuestionario

Obtener primero el formulario de evaluación. Sus reglas indican cuáles preguntas son obligatorias y sus límites; la lectura anterior `/questionnaires/active/:id` sigue siendo compatible, pero no entrega esos datos ni la revisión necesaria para enviar respuestas.

Ejemplo ilustrativo: reemplazar IDs y revisión por los que entregue el formulario real.

```json
{
  "questionnaireId": 1,
  "revision": "<revision SHA-256 de 64 caracteres recibida del formulario>",
  "answers": [
    { "questionId": 10, "value": [100, 101] },
    { "questionId": 11, "value": "Construir APIs para aplicaciones web" },
    { "questionId": 12, "value": 120 },
    { "questionId": 13, "value": 0 },
    { "questionId": 14, "value": false }
  ]
}
```

| Tipo de pregunta | `value` |
| --- | --- |
| `single_choice` | ID entero de una opción de esa pregunta |
| `multiple_choice` | Array no vacío de IDs únicos de opciones de esa pregunta |
| `text` | Texto no vacío después de quitar espacios exteriores; máximo 2000 caracteres o el límite configurado |
| `number` | Número JSON finito dentro del rango configurado; `0` es válido si el rango lo permite |
| `boolean` | Booleano JSON; `false` es una respuesta válida |

Omitir la entrada completa para una pregunta opcional sin respuesta. No enviar `null`, cadena vacía ni array vacío como sustitutos. Para declarar un nivel desconocido, seleccionar la opción cuya regla contiene `value: null`; el cuerpo sigue enviando el ID de esa opción.

No se admite `userId` en el cuerpo. La identidad procede de la sesión. El formulario admite hasta 100 preguntas y hasta 100 opciones por regla. Si cambian preguntas, opciones o reglas, una revisión anterior devuelve `409`; el cliente debe obtener el formulario de nuevo y permitir revisar las respuestas.

## Configuración administrativa

Hay una regla por cada pregunta activa. La obligatoriedad y los límites pertenecen a la configuración de evaluación, sin alterar los contratos históricos de administración de preguntas. Los cuestionarios antiguos permanecen consultables, pero necesitan configuración antes de aceptar evaluaciones.

```json
{
  "rules": [
    {
      "questionId": 10,
      "required": true,
      "kind": "category_interest",
      "maxSelections": 2,
      "options": [
        { "optionId": 100, "value": 1 },
        { "optionId": 101, "value": 2 }
      ]
    },
    {
      "questionId": 11,
      "required": true,
      "kind": "goal",
      "maxLength": 1000,
      "options": []
    },
    {
      "questionId": 12,
      "required": false,
      "kind": "self_reported_skill",
      "technologyId": 3,
      "options": [
        { "optionId": 120, "value": "beginner" },
        { "optionId": 121, "value": null }
      ]
    }
  ]
}
```

| `kind` | Interpretación |
| --- | --- |
| `category_interest` | Opciones de selección única/múltiple mapeadas a IDs de categorías existentes |
| `technology_interest` | Opciones de selección única/múltiple mapeadas a IDs de tecnologías existentes |
| `goal` | Texto libre o selección de opciones mapeadas a objetivos textuales |
| `self_reported_skill` | Una pregunta de selección única por tecnología; opciones mapeadas a `beginner`, `intermediate`, `advanced` o `null` |
| `none` | Respuesta conservada en el historial, sin efecto sobre el perfil; `options: []` |

En preguntas de selección con interpretación se deben mapear todas las opciones exactamente una vez. `min`/`max` solo aplican a números; `maxLength`, a texto; `maxSelections`, a selección múltiple. Las preguntas numéricas y booleanas usan `kind: "none"` en este MVP; no se infiere dominio a partir de ellas.

Modificar una pregunta puede invalidar su configuración. Hasta corregir las reglas, la lectura del formulario y el envío devuelven `409` para evitar interpretaciones incorrectas. Los conflictos de concurrencia también devuelven `409` y permiten volver a consultar el formulario.

## Contrato para Persona 2

Importar `AssessmentsModule` e inyectar `AssessmentsService`. El tipo `AssessmentProfile` se exporta desde `src/assessments/index.ts`.

```ts
const profile = await assessments.getProfileForUser(authenticatedUser.id, assessmentId);
const catalog = await catalogService.getPublishedCatalog();
// Persona 2 construye el contexto de IA y valida sus cursos antes de guardar la ruta.
```

Ejemplo del perfil (IDs ilustrativos):

```json
{
  "assessmentId": 8,
  "questionnaireId": 1,
  "profileVersion": 1,
  "completedAt": "2026-09-21T12:00:00.000Z",
  "interests": { "categoryIds": [1], "technologyIds": [3] },
  "goals": ["Construir APIs"],
  "skills": [
    { "technologyId": 3, "level": "beginner", "source": "self_reported" },
    { "technologyId": 4, "level": null, "source": "unknown" }
  ],
  "readyForGeneration": true
}
```

`getProfileForUser` verifica propiedad y exige al menos un interés (categoría o tecnología) y un objetivo. Devuelve `409` para un perfil insuficiente y `404` para una evaluación inexistente o ajena. Las lecturas HTTP sí permiten consultar perfiles insuficientes con `readyForGeneration: false`.

El perfil no contiene nombre, correo, dirección ni identidad de Discord. Los objetivos son texto del usuario: tratarlos como datos, no como instrucciones para la IA. El estado `readyForGeneration` solo expresa suficiencia del perfil; Persona 2 debe verificar que existan cursos publicados compatibles, elegir los intereses de cada ruta y validar la salida con `validateRoadmapSelection()`.

## Persistencia y límites

- `self_assessments`: usuario UUID, cuestionario, fecha, perfil y copia del formulario y reglas.
- `self_assessment_answers`: una respuesta tipada en JSONB por pregunta y evaluación. Las selecciones múltiples se guardan juntas.
- `evaluation_configs`: configuración vigente y versión por cuestionario.
- `evaluation_taxonomy_refs`: referencias con claves foráneas restrictivas que mantienen válidos los IDs del catálogo usados por configuraciones e historiales.

Los IDs de preguntas y opciones históricos se resuelven contra la copia guardada. Eliminar una opción original no elimina respuestas anteriores. Se restringe el borrado físico del cuestionario referenciado; su desactivación sigue permitida. Eliminar un usuario elimina sus evaluaciones.

La evaluación se guarda en una transacción con lectura repetible. Respuestas inválidas o fallos al escribir provocan rollback completo. La configuración y la importación de contenido comparten el advisory lock del catálogo; un envío usa lectura repetible y no toma ese lock. Las referencias históricas de una evaluación cubren solo el perfil; la configuración vigente sigue anclando el vocabulario completo de la definición. La copia corresponde al estado leído por esa transacción; las futuras modificaciones no recalculan perfiles ya entregados.

## Verificación y pendientes de integración

Las pruebas cubren validación de los cinco tipos, aislamiento de usuarios, permisos administrativos, revisiones obsoletas, historia estable, rollback, migraciones e importación repetible. Ejecutar `pnpm test` y la suite PostgreSQL descrita en [catálogo](catalog.md#verificación).

El frontend está en desarrollo. Quedan pendientes el recorrido real de Discord y la prueba completa contra el generador de Persona 2. Las pruebas locales de autenticación no reemplazan ese recorrido.
