# Usuarios

Las cuentas se administran en `/api/user`. Hace falta una sesión completa. Un `admin` ve todas las cuentas. Un `client` ve la suya y las de sus usuarios hijos. El borrado desactiva la cuenta; no elimina la fila.

Las respuestas usan `{ data }` o `{ data, meta }` en camelCase. La contraseña y el secreto 2FA no salen en ninguna serialización.

## Camino rápido

1. Iniciar sesión como `admin` o `client`.
2. Crear con `POST /user`.
3. Listar con `GET /user?page=1&limit=20`.
4. Desactivar con `DELETE /user/:id` (solo `admin`).

## Endpoints

| Método y ruta | Quién | Comportamiento |
| --- | --- | --- |
| `POST /user` | `admin`, `client` | Crea la cuenta y responde el detalle |
| `GET /user` | `admin`, `client` | Listado paginado `{ data, meta: { total, limit, offset } }` |
| `GET /user/:id` | `admin`, `client`, `user` | Detalle por UUID. Un `user` solo lee su propia cuenta |
| `POST /user/search` | `admin`, `client` | Busca por email, nombre o rol |
| `POST /user/byClient` | `client` | Usuarios hijos de ese cliente |
| `PATCH /user/:id` | `admin`, `client` | Actualiza perfil; el rol y el dueño solo los cambia un `admin` |
| `DELETE /user/:id` | `admin` | Pone `isActive=false` |

El alta pública está en `POST /auth/register`. Este módulo es para cuentas administradas.

Alta:

```json
{
  "email": "student@example.com",
  "password": "Password1!",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "address": "Campus principal"
}
```

Nombre y apellido se guardan en minúsculas, recortados. El email también. Un `client` no puede asignar rol ni otro `client_id`: el servicio fuerza `user` y lo cuelga de su id. La cuenta queda con `mustChangePassword=true` y el primer login pide cambio de contraseña. Ver [auth](auth.md).

Detalle serializado: `id, email, discordId|null, firstName, lastName|null, address|null, role, isActive, isTwoFactorEnabled, isTwoFactorPending, mustChangePassword, client|null`. El cliente anidado trae `id, email, firstName, lastName, role, isActive`. El listado agrega `quantityUsers`, la cantidad de cuentas que cuelgan de ese usuario.

## Alcance

| Actor | Qué puede ver o editar |
| --- | --- |
| `admin` | Todas las cuentas. Puede cambiar `role` y `client_id` |
| `client` | Su propia cuenta y los usuarios cuyo `client` es él. No cambia rol ni dueño |
| `user` | Solo `GET /user/:id` de su propia cuenta. No lista, busca, crea ni edita otras cuentas |

`GET /user` filtra `isActive=true` salvo `all=true`. Si no llega `limit` ni `pageSize`, el listado usa 100; el máximo es 100. `page` y `offset` se resuelven a `meta.offset`. Un cliente que pide `POST /user/byClient` con un `user_id` distinto del suyo recibe `403`.

`POST /user/search` espera `{ "key": "ada" }` y busca subcadena, sin distinguir mayúsculas, en email, nombre completo y rol. Respeta el mismo alcance.

Un UUID inexistente responde `404`. Un email ya usado responde `400`. Un `client` que intenta cambiar `role` o `client_id` responde `403`.
