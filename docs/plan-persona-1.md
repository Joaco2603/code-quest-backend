# Plan de trabajo — Persona 1

Preparar el cuestionario, la evaluación del usuario y el catálogo de cursos para que Persona 2 pueda generar rutas de aprendizaje con IA. Validar también el registro y el acceso con Discord ya implementados.

Fecha: 21 de septiembre de 2026. Base revisada: `feat/registro-publico`, commit `31b7f84`. Las casillas marcadas representan implementación local verificada, no despliegue ni validación del frontend.

## Avance de implementación

Implementados: permisos del catálogo, corrección de roles definidos a nivel de controlador, evaluaciones transaccionales, perfil de autoevaluación, reglas versionadas, historial e importador repetible de `COURSES.json`. Ver [contrato y endpoints](assessments.md), [carga inicial](content-import.md) y [evidencia de verificación](persona-1-verificacion.md).

Decisiones confirmadas con el usuario: autoevaluación del nivel; usar `COURSES.json`; frontend todavía en desarrollo. El archivo tiene 74 cursos con enlace a DevTalles y 8 sin enlace, que se omiten. Los 74 se importan como borradores porque faltan imagen, duración, nivel y tecnologías. La carga se verificó en una base aislada de pruebas; no se aplicó sobre desarrollo.

Pendientes: completar metadatos y publicar cursos, confirmar el contrato con Persona 2, validar Discord real con el frontend y probar generación/rutas/progreso junto con Persona 2.

## Resultado esperado

Un usuario puede ingresar, responder un cuestionario y recuperar una evaluación propia con intereses, objetivos y nivel por tecnología. El catálogo contiene cursos reales de DevTalles publicados y administrables. Persona 2 recibe un contrato estable para consumir esa evaluación desde el generador con IA.

La integración del proveedor de IA, la generación, la persistencia de rutas y el progreso corresponden a Persona 2.

## Punto de partida

| Área | Estado verificado | Trabajo de Persona 1 |
| --- | --- | --- |
| Cuestionarios | Administración y lectura de cuestionarios activos implementadas | Agregar respuestas, evaluación y contenido inicial |
| Evaluaciones | No hay módulo ni migraciones | Implementar persistencia, validación y perfil |
| Catálogo | Cursos, categorías, tecnologías y prerrequisitos implementados | Integrar permisos y cargar contenido real |
| Administración del catálogo | `CatalogAdminGuard` devuelve siempre `false` | Conectarlo con la sesión y el rol administrador |
| Autenticación | Registro, login, Discord y desafíos de 2FA implementados | Validar integración real con el frontend |

Referencias: [cuestionarios](../src/questions/PLAN.md), [catálogo](catalog.md), [autenticación](../src/auth/controllers/auth.controller.ts), [configuración de entidades y migraciones](../src/config/database.ts).

## Orden de ejecución

1. Acordar el contrato de evaluación y entregar un ejemplo a Persona 2.
2. Habilitar administración del catálogo y definir categorías y tecnologías compartidas.
3. Implementar persistencia y envío de evaluaciones.
4. Implementar las reglas del perfil y cargar el cuestionario y los cursos.
5. Verificar Discord con el frontend y completar las pruebas de integración.

Persona 2 puede avanzar con el ejemplo del contrato mientras se implementa el servicio real. La carga de contenido requiere que categorías y tecnologías estén definidas primero.

## P1-01 — Acordar el contrato con Persona 2

- [ ] Acordar nombres, tipos y semántica de intereses, objetivos y habilidades.
- [x] Usar UUID para usuarios e identificadores enteros para las entidades existentes de cuestionarios y catálogo.
- [x] Representar el nivel desconocido explícitamente; no asumir que ausencia de información significa principiante.
- [x] Definir si el nivel proviene de autoevaluación o de preguntas puntuadas. No presentar una autoevaluación como prueba objetiva de dominio.
- [ ] Entregar un ejemplo del perfil y acordar cómo Persona 2 seleccionará los intereses de cada nueva ruta.
- [ ] Coordinar nombres y orden de migraciones, así como cambios compartidos en `AppModule` y `databaseOptions`.

Contrato propuesto para acordar antes de implementar:

```ts
type AssessmentProfile = {
  assessmentId: number;
  questionnaireId: number;
  profileVersion: number;
  completedAt: string;
  interests: {
    categoryIds: number[];
    technologyIds: number[];
  };
  goals: string[];
  readyForGeneration: boolean;
  skills: Array<{
    technologyId: number;
    level: 'beginner' | 'intermediate' | 'advanced' | null;
    source: 'self_reported' | 'unknown';
  }>;
};
```

Servicio interno propuesto: `getProfileForUser(userId, assessmentId)`. Debe comprobar propiedad y devolver solo evaluaciones completas. `userId` se obtiene de la sesión verificada; no se acepta como autoridad desde el cuerpo HTTP. El perfil destinado a IA no necesita correo, nombre, dirección ni identificadores de Discord.

**Aceptación:** ambas personas utilizan el mismo contrato y Persona 2 puede desarrollar con un ejemplo sin depender de la base de datos de Persona 1.

## P1-02 — Habilitar administración del catálogo

- [x] Reutilizar la autenticación y los controles de sesión y rol existentes para sustituir el guard provisional.
- [x] Proteger todas las operaciones administrativas de cursos, categorías y tecnologías, incluidas las lecturas administrativas.
- [x] Mantener las consultas públicas de cursos publicados.
- [x] Verificar que los tokens temporales de 2FA, recuperación o cambio de contraseña no habiliten operaciones administrativas.
- [x] Actualizar la prueba que actualmente espera denegación incondicional del guard.
- [x] Documentar cómo disponer de una cuenta administradora autorizada para la carga inicial, sin agregar credenciales fijas ni un bypass.

**Aceptación:** un administrador con sesión completa puede crear y publicar cursos; un usuario estándar no puede administrarlos. Los borradores no se exponen en lecturas públicas.

## P1-03 — Persistir evaluaciones y respuestas

- [x] Crear un módulo `assessments` con entidades, DTOs, servicio, controlador y serializadores.
- [x] Crear una migración para `assessments` y `user_responses`, con claves foráneas e índices por usuario y evaluación.
- [x] Guardar usuario, cuestionario, fecha de finalización, versión de las reglas y perfil calculado.
- [x] Modelar respuestas de selección única, múltiple, texto, número y booleano sin perder sus tipos.
- [x] Guardar una copia de las preguntas, opciones y reglas utilizadas para que una edición posterior no cambie el significado histórico de la evaluación.
- [x] Definir restricciones o desvinculación controlada al eliminar opciones originales; la copia histórica debe conservarse y ninguna eliminación debe borrar respuestas en cascada.
- [x] Registrar entidades y migraciones en `src/config/database.ts` e importar el módulo en `src/app.module.ts`.
- [x] Mantener `synchronize: false` y verificar aplicación y reversión de la migración en una base de pruebas.

Decisión propuesta para el MVP: envío completo en una sola operación. Persistir respuestas y perfil en una transacción; no incorporar borradores ni guardado parcial en esta entrega.

El archivo [DB_SCHEMA.txt](../DB_SCHEMA.txt) es orientativo: sus usuarios tienen ID entero, pero la entidad implementada utiliza UUID. Adaptar las nuevas claves foráneas a la entidad real.

**Aceptación:** cada evaluación conserva sus respuestas y perfil después de reiniciar la aplicación y de editar el cuestionario original.

## P1-04 — Recibir y consultar evaluaciones

Endpoints propuestos, todos con sesión completa y prefijo `/api`:

| Método | Ruta | Resultado |
| --- | --- | --- |
| `POST` | `/assessments` | Validar un cuestionario respondido, calcular el perfil y persistir la evaluación |
| `GET` | `/assessments` | Listar únicamente las evaluaciones del usuario con paginación |
| `GET` | `/assessments/:id` | Consultar la evaluación propia y su resultado |

- [x] Definir payloads para los cinco tipos de pregunta y documentar ejemplos, incluida selección múltiple.
- [x] Validar cuestionario y preguntas activos, pertenencia de opciones y ausencia de preguntas u opciones duplicadas.
- [x] Agregar una política de obligatoriedad: el modelo actual de preguntas no tiene un campo `required`. Si se incorpora, definir su valor para preguntas existentes y su migración.
- [x] Validar límites de texto, rangos numéricos y cantidad de selecciones cuando el cuestionario los requiera.
- [x] Diferenciar valores válidos como `false` y `0` de respuestas faltantes.
- [x] Rechazar envíos incompletos o inválidos antes de confirmar la transacción.
- [x] Evitar consultas por ID sin filtro de propietario; devolver `404` si la evaluación no existe o no pertenece al usuario.
- [x] Mantener los envoltorios existentes de respuestas `{ data }` y paginación `{ data, meta }`.

**Aceptación:** un envío válido crea una evaluación completa; uno inválido no deja registros parciales. Un segundo usuario no puede acceder a la evaluación.

## P1-05 — Calcular el perfil de habilidades e intereses

- [x] Definir reglas explícitas para mapear respuestas a categorías, tecnologías y objetivos.
- [x] Persistir o versionar esas reglas junto con el contenido del cuestionario; evitar dependencias de textos visibles o IDs específicos de una instalación.
- No aplica al MVP acordado: preguntas técnicas puntuadas, pesos y umbrales. El nivel se declara mediante opciones explícitas.
- [x] Mantener separado el interés por una tecnología del nivel de conocimiento declarado o evaluado.
- [x] Validar referencias al catálogo y proteger tecnologías o categorías utilizadas por las evaluaciones frente a eliminaciones incompatibles.
- [x] Persistir el perfil y exponer `getProfileForUser` desde el módulo.
- [x] Definir qué información mínima habilita la generación y cómo se representa un perfil insuficiente.

La generación de la ruta es con IA y pertenece a Persona 2. Las reglas de esta tarea preparan la entrada del generador y permiten explicar cómo se obtuvo el perfil.

**Aceptación:** las mismas respuestas y versión de reglas producen el mismo perfil; el resultado no confunde interés con dominio ni infiere niveles de preguntas sin responder.

## P1-06 — Cargar cuestionario y catálogo inicial

- [x] Preparar un mecanismo de carga explícito y repetible, con claves estables para evitar duplicados y sin sobrescribir ediciones administrativas silenciosamente.
- [x] Cargar categorías y tecnologías compartidas con el cuestionario.
- [ ] Cargar cursos reales de DevTalles con enlaces verificados, descripción, instructor, duración, nivel, categorías y tecnologías.
- [ ] Configurar prerrequisitos sin ciclos y publicar primero los cursos requeridos.
- [x] Cargar preguntas, opciones y reglas para intereses, objetivos y habilidades.
- [x] Cubrir al menos dos intereses distintos para probar múltiples rutas personalizadas.
- [x] Documentar fuente, fecha de revisión y procedimiento de actualización del contenido.

Usar las validaciones existentes del catálogo para asegurar que los datos publicados estén completos. La carga inicial debe ser una acción documentada, no una modificación automática de datos al arrancar la API.

**Aceptación:** ejecutar nuevamente la carga no duplica contenido y hay cursos publicados suficientes para los escenarios de integración acordados.

## P1-07 — Validar registro y Discord con el frontend

- [ ] Verificar configuración de credenciales, callback, URL del frontend y orígenes permitidos sin incluir secretos en el repositorio.
- [ ] Probar registro público y login con contraseña.
- [ ] Probar Discord con un usuario nuevo y uno existente: autorización, callback, intercambio del ticket y sesión.
- [ ] Probar cancelación del consentimiento, ticket inválido o reutilizado y usuario inactivo.
- [ ] Probar vinculación autenticada de Discord cuando ya existe una cuenta con el mismo correo; no esperar vinculación automática por coincidencia de email.
- [ ] Verificar desafíos de 2FA y cambio de contraseña cuando correspondan.
- [ ] Confirmar que el usuario autenticado pueda consultar el cuestionario y enviar una evaluación.

**Aceptación:** el flujo funciona con Discord real y el frontend de prueba. Si faltan credenciales o un frontend disponible, registrar la validación como pendiente; los mocks no sustituyen esa comprobación.

## P1-08 — Pruebas, documentación y entrega

| Área | Evidencia requerida |
| --- | --- |
| Respuestas | Casos válidos e inválidos de los cinco tipos, obligatoriedad y pertenencia |
| Perfil | Reglas reproducibles, nivel desconocido y separación de intereses y habilidades |
| Persistencia | Migraciones, transacción sin registros parciales e historial estable ante ediciones |
| Autorización | Dos usuarios aislados y administración permitida solo con sesión y rol adecuados |
| Contenido | Carga repetible y referencias válidas entre cuestionario y catálogo |
| Autenticación | Pruebas existentes y recorrido manual real con Discord |
| Integración | Persona 2 consume el perfil real y cursos publicados para generar con IA |

- [x] Agregar pruebas unitarias de validación y reglas, y pruebas HTTP con PostgreSQL para persistencia y autorización.
- [x] Ampliar la configuración E2E cuando sea necesario: la suite actual con PostgreSQL está centrada en catálogo.
- [x] Ejecutar `pnpm typecheck`, `pnpm lint` y `pnpm test` al completar la implementación.
- [x] Ejecutar `pnpm test:e2e` contra una base dedicada mediante `TEST_DATABASE_URL`, cuyo nombre termine en `_test`; no utilizar la base de desarrollo.
- [x] Actualizar Swagger y documentar payloads, perfil, errores y carga inicial en `docs`.
- [x] Actualizar el README para reflejar lo realmente implementado.
- [ ] Entregar a Persona 2 el contrato definitivo, ejemplo, servicio exportado, catálogo disponible y cualquier limitación pendiente.

## Integración final con Persona 2

- [ ] Un usuario ingresa con Discord y completa el cuestionario.
- [ ] El backend recupera su evaluación persistida.
- [ ] El generador de Persona 2 produce con IA dos rutas para intereses diferentes usando cursos publicados.
- [ ] El usuario guarda ambas rutas y recupera el progreso después de volver a ingresar.
- [ ] Un segundo usuario no puede consultar ni modificar evaluaciones, rutas o progreso del primero.

Persona 1 responde por evaluaciones, contenido y acceso; Persona 2 responde por generación con IA, rutas y progreso. El recorrido completo se verifica entre ambos antes de considerar terminado el alcance.
