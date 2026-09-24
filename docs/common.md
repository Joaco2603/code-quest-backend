# Común

`CommonModule` no publica rutas de negocio. Aplica a toda la API el filtro de errores, el log de cada request, el límite de peticiones, el contexto de request y el cifrado usado por los secretos 2FA.

## Qué hace en cada request

1. `RequestContextMiddleware` corre en todas las rutas y deja el contexto del request.
2. `RateLimitGuard` es un guard global. `OPTIONS` y `GET /api/health` no cuentan.
3. `HttpLoggingInterceptor` registra la petición.
4. `GlobalExceptionFilter` convierte las excepciones al cuerpo de error de Nest (`statusCode`, `message`).

El límite por defecto es 120 peticiones por minuto y por combinación de IP, método y ruta. Se cambia con `RATE_LIMIT_MAX` y `RATE_LIMIT_TTL_MS`. Un handler puede bajarlo con `@RateLimit(cantidad, ventanaMs)`; auth lo hace en registro, login y Discord. Superar el cupo responde `429`.

El contador vive en memoria del proceso. Reiniciar la API lo vacía y no se comparte entre réplicas.

## Auditoría y cifrado

`AuditLogService` escribe eventos de dominio (alta de usuario, login, cambio de contraseña, desactivación). No es un endpoint.

`EncryptionService` cifra material sensible, en particular secretos de segundo factor, con `ENCRYPTION_KEY` (64 caracteres hexadecimales). Hay que conservar la misma clave entre despliegues: rotarla sin migrar los secretos deja ilegibles los registros ya cifrados.

## Salud

`GET /api/health` no exige sesión y no consume el límite. Responde:

```json
{
  "status": "ok",
  "timestamp": "2026-09-23T12:00:00.000Z",
  "uptime": 12.3
}
```

`uptime` son segundos desde el arranque del proceso. La ruta comprueba que el proceso responde; no consulta PostgreSQL.
