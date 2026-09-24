# Cuestionario adaptativo

> El flujo de intentos y respuestas parciales (`POST /assessments`,
> `PUT /assessments/:id/answers`, `POST /assessments/:id/complete`) fue
> reemplazado por [evaluaciones](assessments.md). Esta página queda como
> redirección histórica; ver [notas de integración](integracion-pendientes.md).

La migración `1789600005000-AdaptiveQuestionnaire` sigue vigente: agrega las
reglas condicionales. Con la simplificación del MVP, `DropLegacyAssessments`
elimina después las tablas del flujo anterior (`assessments`, `user_answers`);
sus filas no se conservan. `1789948804000-DeactivateAdaptiveQuestionnaire` deja
inactivo el cuestionario sembrado por esa migración, porque no tiene
configuración de evaluación.
