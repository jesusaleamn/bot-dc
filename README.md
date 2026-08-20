# Bot de inventarios por gremio para Discord

Bot sencillo para gestionar inventarios compartidos por canal dentro de un servidor de Discord.

No incluye economía, tienda, monedas, RPG, personajes ni inventarios personales. Cada inventario pertenece únicamente a la combinación `guild_id + channel_id`.

Repositorio del proyecto: `https://github.com/jesusaleamn/bot-dc`

## Netlify

Este proyecto incluye dos formas de despliegue:

- `discord.py` + Docker para VPS o servidores normales.
- Netlify Functions + PostgreSQL externo para Netlify.

Si quieres usar Netlify, sigue [NETLIFY_DEPLOY.md](NETLIFY_DEPLOY.md). En Netlify el bot funciona mediante el `Interactions Endpoint URL` oficial de Discord, no como proceso Python permanente.

Ruta más corta para copiar y pegar: [COPIAR_PEGAR_NETLIFY.md](COPIAR_PEGAR_NETLIFY.md).

Si no quieres usar GitHub, sigue [NETLIFY_SIN_GITHUB.md](NETLIFY_SIN_GITHUB.md).

Ruta recomendada, la más fácil para compartir e instalar: [GUIA_FACIL_GITHUB_NETLIFY_DISCORD.md](GUIA_FACIL_GITHUB_NETLIFY_DISCORD.md).

## Instalación rápida

1. Instala Python 3.12 o superior.
2. Copia el archivo de variables:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Crea una aplicación en Discord Developer Portal y copia el token del bot en `.env`:

   ```env
   DISCORD_TOKEN=tu_token_real
   ```

4. Crea un entorno virtual e instala dependencias:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

5. Arranca el bot:

   ```powershell
   python bot.py
   ```

6. Invita el bot a tu servidor con los permisos mínimos indicados más abajo.
7. En un canal como `#almacen-alquimia`, ejecuta:

   ```text
   /inventario nombre:Alquimia
   /crear id:1 nombre:Flor de montaña cantidad:50
   /sumar id:1 cantidad:101
   /restar id:1 cantidad:10
   ```

El mensaje permanente del inventario se actualizará en el canal. Las respuestas de `/sumar` y `/restar` serán efímeras.

## Configuración

El bot lee configuración desde variables de entorno. Para desarrollo local puedes usar `.env`.

```env
DISCORD_TOKEN=tu_token_real
DATABASE_URL=sqlite+aiosqlite:///data/inventory.sqlite3
COMMAND_GUILD_ID=
SYNC_COMMANDS=true
LOG_LEVEL=INFO
```

`DISCORD_TOKEN`: token del bot de Discord. Nunca lo subas a Git.

`DATABASE_URL`: URL de base de datos. Por defecto usa SQLite persistente en `data/inventory.sqlite3`.

`COMMAND_GUILD_ID`: opcional. Si pones el ID de tu servidor de pruebas, los slash commands se sincronizan en ese servidor y aparecen mucho antes.

`SYNC_COMMANDS`: si está en `true`, el bot sincroniza slash commands al arrancar.

`LOG_LEVEL`: nivel de logs, por ejemplo `INFO` o `DEBUG`.

`HEALTHCHECK_PORT`: opcional. Si tu hosting exige que el proceso escuche en un puerto HTTP, pon aquí el puerto o deja que el hosting defina `PORT`. El bot expondrá `/health`.

## Base de datos

El bot crea automáticamente las tablas al arrancar usando SQLAlchemy.

SQLite local:

```env
DATABASE_URL=sqlite+aiosqlite:///data/inventory.sqlite3
```

PostgreSQL:

```env
DATABASE_URL=postgresql+asyncpg://usuario:password@host:5432/inventory_bot
```

Si tu proveedor te da una URL como `postgresql://...?...sslmode=require`, puedes pegarla tal cual. El bot la adapta automáticamente a `postgresql+asyncpg://...?...ssl=require`.

También hay migraciones SQL de referencia en `database/migrations/`.

Tablas principales:

- `inventories`: guarda `guild_id`, `channel_id`, nombre y `message_id` del mensaje permanente.
- `inventory_items`: guarda objetos por inventario, con IDs del 1 al 9.
- `inventory_history`: registra cambios con usuario, operación, cantidad anterior y cantidad nueva.

## Discord Developer Portal

1. Entra en [Discord Developer Portal](https://discord.com/developers/applications).
2. Pulsa `New Application`.
3. Abre `Bot`.
4. Crea el bot y copia el token.
5. Pega el token en `.env` como `DISCORD_TOKEN`.
6. No actives intents privilegiados; este bot no necesita leer el contenido de mensajes.

## Invitar el bot

En `OAuth2` → `URL Generator`, selecciona estos scopes:

- `bot`
- `applications.commands`

Permisos del bot:

- View Channels
- Send Messages
- Embed Links
- Read Message History

No necesita permiso de administrador. Si usas el generador de URL, el bitfield de esos permisos es `84992`.

## Slash Commands

Discord no permite usar `/+` ni `/-` como nombres de slash commands. La documentación oficial exige que los nombres de comandos `CHAT_INPUT` cumplan una expresión regular que no incluye `+` ni `-`: [Application Command Naming](https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-naming).

Por eso este bot usa:

- `/sumar`
- `/restar`

## Comandos

Públicos para cualquier usuario que pueda usar comandos en el canal:

```text
/inventario nombre:Alquimia
/crear id:1 nombre:Flor de montaña cantidad:50
/sumar id:1 cantidad:101
/restar id:1 cantidad:10
/editar id:1 nombre:Nuevo nombre
/ver
/recrear_inventario
/historial limite:10
/ayuda
```

Protegido:

```text
/borrar id:1
```

Solo `/borrar` requiere que el usuario tenga al menos uno de estos permisos en Discord:

- Administrator
- Manage Server
- Manage Channels

## Crear el primer inventario

En `#almacen-alquimia`:

```text
/inventario nombre:Alquimia
```

El bot publicará un único mensaje permanente:

```text
🧪 INVENTARIO — ALQUIMIA

> No hay objetos registrados.
```

Después:

```text
/crear id:1 nombre:Flor de montaña cantidad:50
```

El mensaje quedará actualizado con:

```text
ID │ MATERIAL                 │ CANTIDAD
1  │ Flor de montaña          │       50
```

Luego:

```text
/sumar id:1 cantidad:20
```

Resultado:

```text
1  │ Flor de montaña          │       70
```

Y:

```text
/restar id:1 cantidad:10
```

Resultado:

```text
1  │ Flor de montaña          │       60
```

## Separación entre gremios

Cada inventario se identifica por `guild_id + channel_id`.

Ejemplo:

En `#almacen-alquimia`:

```text
ID 1 = Flor de montaña = 60
```

En `#almacen-leñadores`:

```text
ID 1 = Leña = 100
```

Si ejecutas esto en `#almacen-leñadores`:

```text
/sumar id:1 cantidad:20
```

El resultado será:

```text
Alquimia:   ID 1 = Flor de montaña = 60
Leñadores:  ID 1 = Leña = 120
```

Los datos no se mezclan aunque ambos canales usen el ID `1`.

## Docker

Para usar Docker con PostgreSQL:

1. Copia `.env.docker.example` a `.env`.
2. Cambia `DISCORD_TOKEN` por tu token real.
3. Comprueba que `DATABASE_URL` apunta al servicio PostgreSQL incluido:

   ```env
   DATABASE_URL=postgresql+asyncpg://inventory:inventory_password@db:5432/inventory_bot
   ```

4. Arranca:

   ```powershell
   docker compose up --build -d
   ```

5. Mira logs:

   ```powershell
   docker compose logs -f bot
   ```

## Sincronizar Slash Commands

El bot sincroniza comandos al arrancar si `SYNC_COMMANDS=true`.

Para pruebas rápidas, usa `COMMAND_GUILD_ID` con el ID de tu servidor. Los comandos de servidor suelen aparecer casi al instante.

Si `COMMAND_GUILD_ID` está vacío, se registran como comandos globales y pueden tardar en aparecer.

## Persistencia

Los datos no se guardan en memoria. Sobreviven reinicios porque viven en SQLite o PostgreSQL.

Si usas SQLite en hosting, asegúrate de que la carpeta `data/` sea persistente. Si tu hosting borra el sistema de archivos al reiniciar, usa PostgreSQL.

## Concurrencia

Las sumas y restas usan actualizaciones atómicas en base de datos. Además, el bot serializa las operaciones por inventario dentro del proceso para que el mensaje permanente se edite con el estado correcto.

Recomendación: ejecuta una sola instancia del bot por base de datos. Si quieres varias réplicas, usa PostgreSQL y añade un mecanismo de bloqueo distribuido antes de escalar horizontalmente.

## Pruebas

Ejecuta:

```powershell
pytest
```

Las pruebas cubren:

- Renderizado básico del inventario.
- Separación por canal.
- Restas sin cantidades negativas.
- Sumas concurrentes sin sobrescribir cambios.

## Solución de problemas

Los comandos no aparecen:

- Comprueba que invitaste el bot con `applications.commands`.
- Pon `COMMAND_GUILD_ID` con el ID de tu servidor de pruebas y reinicia.
- Revisa los logs de arranque.

El bot no puede actualizar el mensaje:

- Dale `View Channels`, `Send Messages`, `Embed Links` y `Read Message History`.
- Si el mensaje fue eliminado manualmente, usa `/recrear_inventario`.

Error de token:

- Revisa que `.env` exista.
- Revisa que `DISCORD_TOKEN` tenga el token real.
- No pongas comillas alrededor del token.

SQLite pierde datos en hosting:

- Usa PostgreSQL o configura un volumen persistente para `data/`.
