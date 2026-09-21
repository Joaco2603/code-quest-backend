# Feature: courses-enrichment

## Objective
Proponer un archivo enriquecido para revisión con los datos faltantes de publicación (imagen, duración, nivel, tecnologías) sin modificar `COURSES.json` original.

## Problem
`COURSES.json` trae título, categoría, instructor, descripción y links (82 registros, 74 con DevTalles), pero la publicación exige `imageUrl`, `durationMinutes`, `level` y `technologyIds`. Prerrequisitos tampoco vienen como IDs.

## Why
Persona 1 necesita cursos publicados para integración con Persona 2; hoy todo queda en `draft` por metadatos incompletos. Usuario eligió "Enriquecido completo": scrape + inferencia con revisión humana final.

## Scope
- Leer `COURSES.json` (solo lectura, no modificar).
- GET públicos a `cursos.devtalles.com` (sin credenciales) para imagen y duración cruda.
- Inferir `level` y tecnologías desde título/descripción solo como propuesta marcada.
- Escribir UN archivo nuevo `COURSES.enriched.json` + este documento. Nada más.

## Constraints
- No modificar `COURSES.json`, no escribir DB, no migraciones, no publicar automáticamente.
- Nunca presentar inferido como verificado: cada campo lleva `provenance: scraped | inferred | unknown`.
- Niveles válidos: `beginner | intermediate | advanced` (ver `src/catalog/entities.ts:SkillLevel`). Vocabulario tech inicial: JavaScript, TypeScript, React, Angular, Vue, NestJS, Node.js, Flutter, Docker, SQL, Python.
- brackets: ~400 authored changed lines heuristic (advisory only, not a cap); no cosmetic savings, no omitted checks to fit it.

## TDD
- Mode: off. Source: orchestrator decision (data-enrichment task, no code behavior change).
- Checks ordinarios: `parseCourseSource` no debe romper, `pnpm content:import COURSES.enriched.json` dry-run ok, muestra de URLs e imágenes responden 200/HTTPS.

## Delivery
- Strategy: `ask-on-risk` (default). Forecast: archivo nuevo ~50-60KB; si el diff acumulado supera ~400 líneas authored, preguntar slice antes del siguiente commit.
- Commits: work-unit por tarea en rama actual `feat/evaluacion-y-catalogo` (no es default, no requiere branch-first). Push/PR/merge los decide el usuario.

## Tasks

- [x] T1-audit — Auditar 82 registros: elegibles/omitidos, campos presentes/ausentes, categorías distintas. Definir esquema enriquecido + reglas de inferencia. Route: inline (≤3 files + bash state). Evidence: python audit 2026-09-21 → total 82, eligible 74, skipped 8, 6 categorías (Backend, Base de datos, Dart Flutter, Desarrollo Web, Infraestructura, Móvil), keys origen sin imagen/duracion/nivel/techs
- [x] T2-pilot — Scrapear piloto de 9 cursos (imagen CDN + horas/lecciones crudas). Documentar patrones y fragilidades. Route: inline (public GETs acotados). Evidence: 9/9 ok — og:image thinkific CDN siempre presente; horas estables ("X horas de contenido en video": 24.5/18.5/16/3.5/16/10/13.5/10/6.5); lecciones con ruido de cursos relacionados (anclar a bloque "Acerca de este curso"); sin nivel explícito (requisitos en texto libre); sin tecnologías explícitas; prerrequisitos solo como texto, mapeo a IDs manual
- [x] T3-enrich — Scrapear 74 elegibles + inferir level/techs + generar `COURSES.enriched.json` con provenance. No tocar original. Route: inline por batches (delegación no disponible en este runtime). Evidence: script /tmp/opencode/enrich.py → total 82, ok 74, fetch_errors 0, without_hours 0; imagen 74/74, duración 74/74; level beginner 16/intermediate 3/advanced 13/unknown 42; 31 sin match en vocabulario (Java/Spring, C#/.NET, PHP/Laravel, Go, Astro, Git, Dart, IA-tools); `git status` sin M en COURSES.json
- [x] T4-validate — Validar enriquecido con parser + dry-run import, listar gaps para curaduría manual, handoff. Route: inline. Evidence: `pnpm build` ok + dry-run `node dist/content/import-content.js COURSES.enriched.json` → 74 elegibles, 8 omitidos, 6 categorías (idéntico al original; claves extra ignoradas por el parser)

## Authorized scope (for workers)
Repo `/home/nr/proyectos/code-quest-backend`, rama `feat/evaluacion-y-catalogo`. Lectura: `COURSES.json`, `src/content/*`, `src/catalog/entities.ts`, `docs/content-import.md`. Escritura: `COURSES.enriched.json`, `odd/tasks/courses-enrichment.md`. Remoto: solo GET públicos a `cursos.devtalles.com`, sin credenciales/sesiones. Prohibido: modificar `COURSES.json`, escribir DB, migraciones, publish automático.

## Acceptance criteria
- [x] `COURSES.enriched.json` existe, parsea con `parseCourseSource`, dry-run ok.
- [x] Cada registro enriquecido indica fuente por campo (scraped/inferred/unknown); nada inferido pasa como verificado.
- [x] `COURSES.json` original intacto (`git status` no lo muestra modificado).
- [x] Lista de gaps manuales (nivel/techs dudosos, prerrequisitos) entregada para revisión. → Ver handoff abajo.

## Progress
- 2026-09-21: T1, T2, T3 y T4 cerradas. Work-unit commit `a52a743`. Handoff de curaduría entregado.

## Verification evidence
- T1: python audit → total 82, eligible 74, skipped 8, 6 categorías, sin campos de publicación en origen.
- T2: python urllib pilot 9 URLs → 9/9 con og:image + horas; lecciones con ruido de relacionados; sin nivel/techs explícitos.
- T3: /tmp/opencode/enrich.py → 82 total, ok 74, 0 errores; imagen y duración 74/74; niveles 16 beginner/3 intermediate/13 advanced/42 unknown; 31 sin vocabulario.
- T4: `pnpm build` ok; dry-run enriquecido → 74 elegibles, 8 omitidos, 6 categorías (igual que original).

## Gaps para curaduría manual (handoff)
- Nivel `unknown` en 42/74: sin marcadores explícitos en título/descripción. Revisar uno por uno.
- 31 cursos sin tecnologías del vocabulario (Java/Spring, C#/.NET, PHP/Laravel, Go, Astro, Qwik, Git, Dart, herramientas de IA, TanStack Query, RxJS, PWA, VSCode, Riverpod). Vocabulario actual de 11 techs no los cubre: decidir si se amplía o se dejan sin techs (quedan en draft).
- Prerrequisitos: `prerequisites_text` capturado como texto libre por curso; mapear a IDs manualmente y validar sin ciclos antes de publicar.
- `durationMinutes` e `imageUrl` scrapeados: verificar una muestra antes de confiar ciegamente (lecciones ya ancladas al bloque Acerca).

## Next step
- Commit work-unit de `COURSES.enriched.json` + doc; entregar handoff al usuario.

## Locator
- File: `odd/tasks/courses-enrichment.md`
- Mirror: Engram topic `odd/courses-enrichment/tasks` (pending — último `mem_save` falló por sesiones múltiples; reintentar cuando runtime lo permita)
