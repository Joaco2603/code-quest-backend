# Flatten course enrichment (COURSES.enriched.json)

## Objective

Aplanar `enrichment` al nivel de cada curso en `COURSES.enriched.json` y eliminar
`status`, `provenance`, `prerequisites_text`, `notes` y `sourceUrl`. El parser y
los tests deben seguir pasando con el nuevo formato.

## Problem

El formato anidado con metadatos de curaduría (`provenance`, `notes`, etc.)
duplica información operativa en el archivo fuente. El usuario lo quiere plano:
lo que queda en el archivo ES la verdad curada.

## Why

Pedido explícito del usuario (dueño del archivo). Archivo único ya decidido:
se conserva `COURSES.enriched.json`, se eliminó `COURSES.json`.

## Scope

- `COURSES.enriched.json` (82 cursos: mover `imageUrl`, `durationMinutes`,
  `durationHoursRaw`, `lessonsRaw`, `level`, `technologyNames` un nivel arriba;
  soltar las 5 claves indicadas)
- `src/seed/content/course-source.ts` (leer el formato plano)
- `src/seed/content/tests/course-source.spec.ts` (actualizar al formato plano)
- `docs/content-import.md` (actualizar menciones a procedencia)
- Verificación de `initial-content.spec.ts` (usa objetos ya parseados; sin cambio esperado)

Fuera de alcance: cambiar la semántica de publicación (imagen/duración siguen
sin copiarse; admin completa antes de publicar).

## Constraints

- Sin `provenance`, todo `level`/`technologyNames` presente se trata como curado.
  Consecuencia: ~16 niveles antes `inferred` (ej. Laravel `beginner`, Nuxt
  `advanced`) ahora se copian al crear el curso. Decisión consciente del dueño
  del archivo.
- `imageUrl`/`durationMinutes`/`durationHoursRaw`/`lessonsRaw` a nivel de curso
  se ignoran en el import (no bloquean por valores inválidos), igual que antes.
- Formato JSON: UTF-8 sin escapes, indent 2, sin newline final (igual al actual).

## Tasks

- [x] T1 Transformar `COURSES.enriched.json` (script, verificar 82 cursos + diff)
- [x] T2 Actualizar `course-source.ts` al formato plano
- [x] T3 Actualizar `course-source.spec.ts` (incl. expectativa Laravel `beginner`)
- [x] T4 Actualizar `docs/content-import.md`
- [x] T5 Verificar: build + vitest contenido/evaluación + dry-run import
- [ ] T6 Work-unit commit en `fix/integracion-pendientes`

## Authorized scope

Rama `fix/integracion-pendientes`. Archivos listados en Scope. Sin cambios de
migraciones, entidades ni endpoints.

## Acceptance criteria

- Ningún curso tiene clave `enrichment`; ninguna tiene `status`/`provenance`/
  `prerequisites_text`/`notes`/`sourceUrl`.
- `parseCourseSource` acepta el archivo nuevo y rechaza `level` inválido.
- Tests de contenido y evaluación en verde; dry-run: 74 elegibles / 8 omitidos.

## Checks

- `pnpm build`
- `vitest run src/seed/content/tests/ src/assessments/tests/`
- `node dist/seed/content/import-content.js COURSES.enriched.json` (dry-run)

## Route

- Ruta: delegated direct preferida; delegación no disponible (runner free-tier
  rechaza subagentes, verificado 2026-09-24) → inline como fallback.
- Triggers: mapping (6 archivos con `enrichment`) y writer (JSON + parser +
  specs + docs) disparados; evidencia arriba. Ejecutar inline es defecto de
  ruteo conocido y documentado, no silencio.
- TDD: no habilitado (sin config de sesión; presencia de tests no lo habilita).
  Checks funcionales ordinarios, sin RED/GREEN inventado.

## Progress

- T1 pendiente de commit junto con T2-T6 (un solo work-unit commit).

## Verification evidence

- `pnpm build`: ok.
- `vitest run` (course-source, initial-content, evaluation, plan-roadmap,
  select-candidates): 5 files, 48 tests, todo verde.
- Dry-run `content:import COURSES.enriched.json`: 74 elegibles / 8 omitidos;
  `curatedOnCreate` level 42→74, technologies 55→71 (niveles antes `inferred`
  ahora se copian, según lo decidido).
- `tsc --noEmit`: limpio. `oxlint src/seed/`: solo warnings preexistentes.
- `grep provenance|row.enrichment src/seed/content/course-source.ts`: vacío.

## Next step

- Ejecutar T1-T5 y commitear.

## Engram mirror

- Mirror pendiente: `mem_save` falla en esta sesión (múltiples runtime sessions
  activas para el proyecto). Re-sincronizar cuando esté disponible.
