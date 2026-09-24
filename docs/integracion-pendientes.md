# Integración de las funcionalidades pendientes

Esta rama se integra directamente en `main` e incorpora los commits de
`feat/registro-publico` y `feat/evaluacion-y-catalogo`, incluidos los PR #11,
#12, #18, #19 y #21. Recupera también el guard de roles tipado, sin `fullName`.

## Cambios para el frontend

El nuevo `/api/assessments` reemplaza el flujo de intentos mutable. Primero
consulta `/api/questionnaires/:id/evaluation`, luego envía las respuestas con
su revisión en una sola petición. Consulta [el contrato completo](assessments.md).
Las rutas antiguas de respuestas parciales y `/complete` dejan de estar registradas.

Para generar una ruta usa `/api/roadmaps/generate`. Se mantienen el CRUD de
roadmaps y el progreso por curso de `main`; no se reemplazan por el CRUD reducido
de la rama de IA. Los catálogos administrativos exigen JWT y rol administrador.

## Base de datos

Las migraciones existentes de `main` se mantienen. Las nuevas evaluaciones usan
`self_assessments` y `self_assessment_answers` para evitar colisiones con el esquema
anterior. Las tablas antiguas permanecen como historial sin rutas HTTP registradas.
El cuestionario sembrado por la migración adaptativa queda inactivo: no tiene
configuración de evaluación y `GET /api/questionnaires/active` no debe ofrecerlo.
La migración de IA amplía `roadmaps` con columnas anulables y conserva las rutas existentes.
`GET /api/roadmaps` incluye `rationale`, `assessmentId` y `createdAt`.

Esta adaptación está dirigida a bases con las migraciones de `main`. Una base
que haya ejecutado las migraciones no integradas de las ramas requiere revisión
antes de aplicar esta versión: se conservaron sus identificadores de migración.

El reinicio solicitado de la base local es una operación independiente; el PR
no contiene comandos que borren automáticamente bases existentes.

## Verificación y reversión

Revisar primero `src/config/database.ts`, las migraciones nuevas y los módulos
Questions/Assessments/Roadmaps. Las pruebas verifican el upgrade desde el esquema
de `main`, la reversión de las migraciones añadidas, la conservación de
historial y roadmaps, y el flujo HTTP evaluación → generación → progreso.

Para revertir código, revertir los commits de integración juntos. No revertir
migraciones con evaluaciones nuevas que se quieran conservar: su `down` elimina
las tablas nuevas y los metadatos de generación, aunque conserva el historial
anterior y las tablas de roadmaps originales.
