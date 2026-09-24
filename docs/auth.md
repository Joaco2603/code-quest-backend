# Autenticación

El registro público crea un usuario `user` activo y devuelve una sesión. El login con email y contraseña hace lo mismo, salvo que la cuenta deba cambiar la contraseña. El segundo factor no está montado en el MVP: `TwoFactorController` existe, pero `AuthModule` no lo registra.

Todas las rutas llevan el prefijo `/api`. Las respuestas van en `{ data: ... }`.

## Camino rápido

1. `POST /auth/register` con email, contraseña, nombre y apellido.
2. Guardar `data.accessToken` y enviarlo como `Authorization: Bearer`.
3. El token de acceso dura 4 horas. `GET /auth/renovated` emite uno nuevo para la misma sesión.
4. Si el login devuelve `requiresPasswordChange`, usar `data.tempToken` solo en `POST /auth/change-password` y volver a iniciar sesión.

## Endpoints

| Método y ruta | Quién | Comportamiento |
| --- | --- | --- |
| `POST /auth/register` | Público | Crea un `user` activo y devuelve `{ accessToken, user }` |
| `POST /auth/login` | Público | Sesión completa, o desafío de cambio de contraseña |
| `GET /auth/renovated` | Sesión completa | Usuario de la sesión y token renovado |
| `POST /auth/change-password` | Token de cambio de contraseña | Cambia la contraseña del dueño del token |
| `POST /auth/register/managed` | `admin` o `client` | Crea una cuenta que debe cambiar la contraseña |
| `POST /auth/register/user` | `admin` | Igual que el anterior, siempre con rol `user` |
| `GET /auth/discord` | Público | Redirige a Discord OAuth |
| `GET /auth/discord/callback` | Público | Valida el código y entrega un ticket de un solo uso |
| `POST /auth/discord/exchange` | Público | Canjea el ticket por una sesión o un desafío |
| `POST /auth/discord/link` | Sesión completa | URL para vincular Discord a la cuenta actual |

Registro público:

```json
{
  "email": "ada@example.com",
  "password": "Password1!",
  "first_name": "Ada",
  "last_name": "Lovelace"
}
```

El email se normaliza a minúsculas. La contraseña exige entre 8 y 20 caracteres, mayúscula, minúscula y un número o símbolo. El rol, la dirección y el cliente no se aceptan en este cuerpo: la cuenta queda como `user`, sin cliente, y puede usar la sesión de inmediato.

Login aceptado:

```json
{
  "data": {
    "accessToken": "<jwt>",
    "user": {
      "id": "43566ec8-22af-41d3-933a-918b536fe99f",
      "email": "ada@example.com",
      "role": "user",
      "mustChangePassword": false
    }
  }
}
```

Cambio de contraseña pendiente:

```json
{
  "data": {
    "requiresPasswordChange": true,
    "userId": "43566ec8-22af-41d3-933a-918b536fe99f",
    "tempToken": "<jwt>"
  }
}
```

Ese `tempToken` dura 10 minutos y su propósito es `password_change`. `POST /auth/change-password` espera `{ "password": "NewPassword1!" }`. Un `userId` distinto del token responde `403`. Después del cambio hay que volver a hacer login: este endpoint no entrega una sesión.

`GET /auth/renovated` exige un token de acceso completo. Responde `{ data: { user, token } }`. Rechaza tokens temporales, de recuperación y cuentas que todavía deben cambiar la contraseña.

## Cuentas creadas por un administrador o un cliente

`POST /auth/register/managed` y `POST /user` dejan `mustChangePassword` en true. El login no abre sesión hasta completar el cambio. Un `client` solo puede crear hijos con rol `user` y `client_id` igual a su propio id. Un `admin` elige el rol (`admin`, `client` o `user`).

`POST /auth/register/user` ignora el rol del cuerpo y siempre crea un `user`.

## Discord

`GET /auth/discord` guarda el estado OAuth en la cookie `discord_oauth_state` y redirige a Discord. El callback valida el código, el state y el verifier PKCE. Por defecto redirige al frontend con un `code` de un solo uso; `?format=json` devuelve `{ data: { code } }` en lugar de redirigir.

`POST /auth/discord/exchange` con `{ "code": "<ticket>" }` consume ese ticket. Un ticket inválido, vencido o reutilizado responde `401`.

`POST /auth/discord/link` no vincula por coincidencia de email. Adjunta la identidad de Discord a la sesión ya autenticada.

Si Discord no está configurado, estos flujos responden `503` con `Discord login is not configured`. En el VPS eso corresponde a `DISCORD_ENABLED=false`.

## Límites y errores

| Ruta | Límite |
| --- | --- |
| `register`, `login`, `change-password` | 5 peticiones por minuto |
| Rutas de Discord | 10 peticiones por minuto |

El resto de la API usa el límite global (`RATE_LIMIT_MAX`, por defecto 120 por minuto). Credenciales inválidas, cuentas inactivas y contraseñas ausentes responden `401` con `Invalid credentials`. Un email duplicado responde `400`.

## Segundo factor

El login no pide TOTP: `requiresTwoFactor` está fijo en false. Las rutas `POST /2fa/generate`, `/2fa/enable` y `/2fa/disable` no están publicadas. `TwoFactorGuard` sigue rechazando cualquier token que no sea de acceso completo, así que un token temporal no abre roadmaps, usuarios ni cuestionarios.
