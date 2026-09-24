# Cuestionario adaptativo

> El flujo de intentos y respuestas parciales (`POST /assessments`,
> `PUT /assessments/:id/answers`, `POST /assessments/:id/complete`) fue
> reemplazado por [evaluaciones](assessments.md). Esta página queda como
> redirección histórica; ver [notas de integración](integracion-pendientes.md).

La migración `1789600005000-AdaptiveQuestionnaire` sigue vigente: agrega las
reglas condicionales y conserva los intentos anteriores sin borrar datos. Las
tablas del flujo anterior permanecen como historial sin rutas HTTP registradas.
