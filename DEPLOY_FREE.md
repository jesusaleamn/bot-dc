# Guía de despliegue gratis con base de datos persistente

Esta guía explica la arquitectura que buscas:

- El bot corre en un host gratuito.
- La base de datos vive fuera del host, en PostgreSQL gestionado.
- Si el host se duerme, reinicia o redepliega, los datos siguen en la base externa.

Importante: esto protege los datos, pero no garantiza que el bot esté online 24/7. Si el host gratuito se duerme, el bot puede dejar de responder hasta que el host despierte.

## Resumen recomendado

Para probar gratis:

- Bot: Render Free Web Service, Koyeb Free Web Service o equivalente.
- Base de datos: Neon PostgreSQL Free.
- Backup: descarga periódica con `pg_dump`.

Para máxima fiabilidad sin pagar mucho:

- VPS barato o Oracle Cloud Always Free.
- Docker Compose con PostgreSQL.
- Backups automáticos fuera del servidor.

## Por qué no guardar SQLite en un host gratis

SQLite guarda los datos en un archivo. Si el host tiene disco efímero, ese archivo puede perderse al reiniciar, redeplegar o dormir.

Por eso, para un host gratis que duerme o reinicia, usa una base externa como PostgreSQL.

## Opción A: Render gratis + Neon PostgreSQL

Esta opción es fácil para empezar.

Limitaciones:

- Render Free Web Service puede dormirse por inactividad.
- Si se duerme, el bot deja de estar conectado a Discord.
- La base de datos externa no se pierde por ese sueño del bot.
- No uses Render Free Postgres para datos importantes porque expira a los 30 días.

### 1. Subir el proyecto a GitHub

1. Crea un repositorio privado o público en GitHub.
2. Sube esta carpeta del proyecto.
3. No subas `.env`.

Archivos importantes:

- `bot.py`
- `inventory_bot/`
- `requirements.txt`
- `Dockerfile`
- `.env.example`

### 2. Crear la base de datos en Neon

1. Entra en https://neon.com/.
2. Crea una cuenta.
3. Crea un nuevo proyecto PostgreSQL.
4. Copia la connection string.

Será parecida a:

```text
postgresql://usuario:password@host.neon.tech/dbname?sslmode=require
```

Puedes pegarla tal cual en `DATABASE_URL`. El bot la convierte automáticamente para `asyncpg`.

### 3. Crear el bot en Discord

1. Entra en https://discord.com/developers/applications.
2. Pulsa `New Application`.
3. Abre `Bot`.
4. Crea el bot.
5. Copia el token.
6. No actives intents privilegiados; este bot no los necesita.

### 4. Crear el servicio en Render

1. Entra en https://render.com/.
2. Crea un `New Web Service`.
3. Conecta tu repositorio de GitHub.
4. Elige el proyecto del bot.
5. Usa Docker si Render detecta el `Dockerfile`.
6. Start command: no hace falta si usa Dockerfile; el Dockerfile ya ejecuta `python bot.py`.

Variables de entorno en Render:

```env
DISCORD_TOKEN=tu_token_real_de_discord
DATABASE_URL=postgresql://usuario:password@host.neon.tech/dbname?sslmode=require
COMMAND_GUILD_ID=id_de_tu_servidor_de_pruebas
SYNC_COMMANDS=true
LOG_LEVEL=INFO
```

Render define `PORT` automáticamente. El bot lo detecta y abre `/health`.

### 5. Evitar que el host se duerma

Puedes crear un monitor externo que visite:

```text
https://tu-servicio.onrender.com/health
```

cada 5 o 10 minutos.

Esto ayuda a que un Web Service gratuito no se duerma, pero no es una garantía absoluta. Si el monitor falla o la plataforma cambia límites, el bot puede dormirse.

### 6. Invitar el bot a Discord

En Discord Developer Portal:

1. Entra en `OAuth2` -> `URL Generator`.
2. Marca:
   - `bot`
   - `applications.commands`
3. Permisos:
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History
4. Abre la URL generada.
5. Invita el bot a tu servidor.

### 7. Primera prueba

En `#almacen-alquimia`:

```text
/inventario nombre:Alquimia
/crear id:1 nombre:Flor de montaña cantidad:50
/sumar id:1
/restar id:1
```

Resultado esperado:

```text
Flor de montaña = 60
```

En otro canal, por ejemplo `#almacen-leñadores`:

```text
/inventario nombre:Leñadores
/crear id:1 nombre:Leña cantidad:100
/sumar id:1
```

Resultado esperado:

```text
Alquimia: ID 1 = Flor de montaña = 60
Leñadores: ID 1 = Leña = 120
```

## Backups de la base externa

Aunque uses una base externa, haz copias. "Persistente" no significa "imposible de perder".

Con PostgreSQL instalado en tu PC:

```bash
pg_dump "postgresql://usuario:password@host.neon.tech/dbname?sslmode=require" > inventarios_backup.sql
```

Hazlo cada cierto tiempo y guarda el archivo fuera del host.

## Opción B: Oracle Cloud Always Free

Esta opción puede funcionar mejor para 24/7 gratis porque tienes una máquina virtual, no un web service que duerme.

Ventajas:

- Puedes ejecutar Docker Compose.
- Puedes tener bot y PostgreSQL juntos.
- El bot puede estar siempre conectado a Discord.

Inconvenientes:

- Es más difícil de configurar.
- Oracle pide tarjeta para verificación.
- Hay límites de capacidad y condiciones de uso.
- Aun así debes hacer backups.

En esta opción usarías:

```bash
docker compose up --build -d
```

con `.env.docker.example` copiado a `.env`.

## Conclusión

Si quieres gratis y fácil:

```text
Render/Koyeb para el bot + Neon PostgreSQL para los datos + backups
```

Si quieres gratis y más 24/7:

```text
Oracle Cloud Always Free + Docker Compose + backups
```

Si quieres tranquilidad real:

```text
VPS barato + PostgreSQL + backups
```
