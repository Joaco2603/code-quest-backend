# Evidencia de implementación — Persona 1

Fecha: 21 de septiembre de 2026. Rama: `feat/evaluacion-y-catalogo`. La base de desarrollo no se migró ni recibió la carga inicial durante esta verificación.

## Comprobaciones ejecutadas

| Comando o escenario | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto, sin errores |
| `pnpm build` | Correcto |
| `pnpm exec vitest run` después del build | 21 archivos, 221 pruebas aprobadas |
| `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/code_quest_test pnpm exec vitest run --config vitest.config.e2e.ts` | 2 archivos, 24 pruebas aprobadas |
| `pnpm lint` | Código de salida 0; 13 advertencias preexistentes, ninguna nueva en evaluaciones, contenido o guard del catálogo |
| `node dist/content/import-content.js COURSES.json` | Dry-run: 74 cursos elegibles, 8 sin enlace DevTalles, 6 categorías |
| Harness Node con las migraciones, `parseCourseSource` e `importInitialContent` sobre `COURSES.json`, en un esquema aleatorio de `code_quest_test` | Primera ejecución: 74 importados y cuestionario creado; segunda: 0 importados, 74 omitidos y mismo cuestionario; 74 cursos en estado `draft` |
| `git diff --check` | Sin errores de espacios en los cambios versionados |

Las pruebas HTTP necesitaron ejecución fuera del sandbox para abrir puertos locales. PostgreSQL se levantó con `docker compose -p codequest-persona1-test -f compose.test.yml up -d --wait`. Cada suite y el harness de importación crearon y eliminaron sus propios esquemas. No usaron la conexión de desarrollo.

El test de rollback provoca deliberadamente un error de restricción `reject_response_test`: el error registrado por Nest es esperado y la prueba verifica que no quede ninguna evaluación parcial. La suite de catálogo también emite una advertencia de deprecación de `pg` sobre consultas concurrentes; no es un fallo de las pruebas.

La corrección posterior del mensaje de `UserRoleGuard` elimina la referencia a `fullName`, tipa el usuario como `AuthUser` y pasó `pnpm typecheck` y el lint focalizado del archivo sin errores.

## Entregables y límites de reversión

| Unidad | Comportamiento y evidencia | Límite de reversión del código |
| --- | --- | --- |
| Permisos | JWT real, roles desde base, sesión completa y restricciones en controladores; 9 pruebas HTTP del guard del catálogo y escenario E2E de preguntas/opciones | `src/catalog/catalog-access.ts`, importación Passport en `catalog.module.ts`, cambio de metadata en `UserRoleGuard`, pruebas y documentación relacionadas |
| Evaluaciones | Reglas de autoevaluación, 5 tipos de respuesta, historial, aislamiento, rollback, revisiones obsoletas y concurrencia; pruebas unitarias y E2E | `src/assessments`, migración `CreateAssessments`, registros en `databaseOptions` y `AppModule`, pruebas y documentación de evaluaciones. Retirar primero la unidad de contenido que depende de ella |
| Contenido inicial | Importador explícito, transaccional y repetible; pruebas del parser, E2E y carga real de 74 registros | `src/content`, migración `CreateContentImports`, script `content:import`, registro de migración, pruebas y guía de carga |

Los límites describen las unidades de revisión incluidas en la entrega. Revertir código no equivale a borrar datos: las migraciones de evaluaciones eliminan su historial al revertirse, y revertir `content_imports` elimina marcas de procedencia. Aplicar reversión de datos únicamente con el procedimiento de respaldo correspondiente; la verificación utilizó PostgreSQL desechable.

## Pendientes explícitos

- Completar imagen, duración, nivel, tecnologías y prerrequisitos revisados para los cursos; después publicarlos. La fuente recibida no contiene los cuatro primeros metadatos y no se inventaron valores.
- Aplicar migraciones e importar contenido al entorno que vaya a usar el equipo. Durante esta tarea solo se escribió en la base de pruebas.
- Confirmar el contrato de `AssessmentProfile` con Persona 2 y probar el generador real. Se incluye `readyForGeneration`; no hay puntajes técnicos ni fuente `scored` en el MVP acordado.
- Probar el flujo real de Discord con el frontend, que el usuario indicó que sigue en desarrollo. Las pruebas de autenticación no demuestran consentimiento real ni redirección en navegador.
- Ejecutar el recorrido conjunto de generación con IA, múltiples rutas y progreso cuando Persona 2 implemente esos módulos.

Ver [plan actualizado](plan-persona-1.md), [contrato de evaluaciones](assessments.md) y [guía de carga](content-import.md).
