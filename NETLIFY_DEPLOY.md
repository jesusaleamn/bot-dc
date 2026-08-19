# Despliegue completo en Netlify

Esta es la guía para tener el bot funcionando en internet sin usar tu PC como host.

## Idea principal

Netlify no es un VPS. No está pensado para mantener un bot Python conectado 24/7 por WebSocket.

Para Netlify usamos otra forma oficial de Discord:

```text
Discord Slash Command
-> Discord llama a una URL de Netlify
-> Netlify Function procesa el comando
-> PostgreSQL guarda los datos
-> Discord REST API edita el mensaje permanente
```

Esto se llama `Interactions Endpoint URL`.

Ventajas:

- No necesitas tener tu PC encendido.
- No necesitas un proceso bot encendido todo el día.
- Netlify se activa cuando Discord llama al endpoint.
- La base de datos vive fuera de Netlify, así que no se pierde al redeplegar.

Limitaciones:

- El bot puede aparecer offline en la lista de miembros, porque no hay conexión Gateway permanente.
- Los slash commands funcionan igualmente si el endpoint está bien configurado.
- Si Netlify o la base de datos tienen un arranque en frío lento, el primer comando tras inactividad podría fallar. Repetir el comando suele solucionarlo.
- Gratis no significa garantía 24/7. Para garantía real necesitas un plan de pago o un VPS.

## Opción recomendada gratis

Usa:

```text
Netlify Functions
+
Neon PostgreSQL Free
+
Backups periódicos
```

Esta es la opción preparada en este proyecto.

## Opciones de base de datos

### 1. Neon PostgreSQL

Recomendada para empezar.

Pros:

- PostgreSQL real.
- Encaja muy bien con Netlify Functions.
- Tiene driver serverless oficial para JavaScript.
- Puedes pegar una connection string tipo `postgresql://...sslmode=require`.

Contras:

- En gratis, el cómputo puede suspenderse por inactividad.
- El primer comando tras mucho rato puede tardar un poco.

### 2. Netlify Database

Buena opción si quieres tenerlo todo dentro de Netlify.

Pros:

- PostgreSQL gestionado desde Netlify.
- Integración nativa con Netlify.
- Branching y migraciones integradas.

Contras:

- Está ligado al modelo de créditos de Netlify.
- La base activa consume créditos.
- Para este proyecto he preparado directamente `DATABASE_URL`, así que Neon externo es más simple.

### 3. Supabase PostgreSQL

También sirve.

Pros:

- PostgreSQL real.
- Panel visual cómodo.
- Plan gratis útil para pruebas.

Contras:

- Los proyectos gratis pueden pausarse por baja actividad.
- Tiene más piezas de las que este bot necesita.

### 4. PostgreSQL barato de pago

La opción más tranquila si el servidor empieza a usar mucho el bot.

Ejemplos:

- Neon Launch.
- Supabase Pro.
- Railway PostgreSQL.
- Render PostgreSQL de pago.
- VPS con PostgreSQL.

Pros:

- Menos sustos.
- Menos sueño por inactividad.
- Mejor para producción.

Contras:

- No es gratis.

### 5. SQLite

No recomendado para Netlify.

SQLite guarda datos en un archivo. En serverless ese archivo no debe tratarse como almacenamiento permanente.

## Archivos añadidos para Netlify

```text
netlify.toml
public/index.html
netlify/functions/discord-interactions.mjs
netlify/functions/health.mjs
src/netlify/
scripts/register-commands.mjs
package.json
.env.netlify.example
```

Endpoint principal:

```text
/discord-interactions
```

Endpoint de salud:

```text
/health
```

## Paso 1: Crear la aplicación en Discord

1. Entra en https://discord.com/developers/applications.
2. Pulsa `New Application`.
3. Ponle nombre.
4. En `General Information`, copia:
   - `Application ID`
   - `Public Key`
5. En `Bot`, crea el bot.
6. Copia el token del bot.

Guarda estos tres valores:

```text
DISCORD_APPLICATION_ID
DISCORD_PUBLIC_KEY
DISCORD_TOKEN
```

No compartas el token.

## Paso 2: Crear la base de datos en Neon

1. Entra en https://neon.com/.
2. Crea una cuenta.
3. Crea un proyecto nuevo.
4. Abre `Connect`.
5. Copia la connection string.

Será parecida a:

```text
postgresql://usuario:password@ep-algo.neon.tech/neondb?sslmode=require
```

Esa será tu:

```text
DATABASE_URL
```

## Paso 3: Subir el proyecto a GitHub

1. Crea un repositorio en GitHub.
2. Sube este proyecto.
3. Asegúrate de no subir:
   - `.env`
   - `.env.netlify.local`
   - `.venv`
   - `node_modules`

Ya están en `.gitignore`.

## Paso 4: Crear el sitio en Netlify

1. Entra en https://app.netlify.com/.
2. Pulsa `Add new site`.
3. Elige `Import an existing project`.
4. Conecta GitHub.
5. Selecciona el repositorio.
6. Netlify leerá `netlify.toml`.

Configuración esperada:

```text
Publish directory: public
Functions directory: netlify/functions
Build command: vacío
```

Si Netlify te obliga a poner build command, usa:

```text
npm install
```

## Paso 5: Variables de entorno en Netlify

En Netlify:

```text
Site configuration
-> Environment variables
-> Add a variable
```

Añade:

```env
DISCORD_TOKEN=tu_token_real
DISCORD_APPLICATION_ID=tu_application_id
DISCORD_PUBLIC_KEY=tu_public_key
DATABASE_URL=postgresql://usuario:password@host.neon.tech/neondb?sslmode=require
```

Opcional:

```env
DISCORD_GUILD_ID=id_de_tu_servidor_de_pruebas
```

Después pulsa `Trigger deploy` para redeplegar con las variables.

## Paso 6: Probar que Netlify responde

Cuando Netlify termine el deploy, tendrás una URL como:

```text
https://tu-sitio.netlify.app
```

Prueba:

```text
https://botinventariodc.netlify.app/health
```

Debe devolver `status: "ok"` y confirmar que las variables necesarias tienen forma correcta:

```json
"applicationIdConfigured": true,
"tokenConfigured": true,
"publicKeyConfigured": true,
"publicKeyValidShape": true,
"urlConfigured": true
```

El endpoint de Discord será:

```text
https://botinventariodc.netlify.app/discord-interactions
```

Antes de guardar en Discord, comprueba que la ruta existe y valida firmas:

```powershell
curl.exe -i -X POST "https://botinventariodc.netlify.app/discord-interactions" -H "Content-Type: application/json" --data '{"type":1}'
```

Debe devolver `401 invalid request signature`. Eso es correcto porque esa petición no viene firmada por Discord.

## Paso 7: Configurar Interactions Endpoint URL en Discord

En Discord Developer Portal:

1. Abre tu aplicación.
2. Entra en `General Information`.
3. Busca `Interactions Endpoint URL`.
4. Pega:

   ```text
   https://botinventariodc.netlify.app/discord-interactions
   ```

5. Guarda.

Discord enviará una prueba `PING`. Si todo está bien, aceptará la URL.

Si falla:

- Revisa `DISCORD_PUBLIC_KEY`.
- Revisa que Netlify ya haya redeplegado.
- Revisa logs en Netlify.

## Paso 8: Registrar Slash Commands

En tu PC, dentro del proyecto:

```powershell
Copy-Item .env.netlify.example .env.netlify.local
notepad .env.netlify.local
```

Rellena:

```env
DISCORD_TOKEN=tu_token_real
DISCORD_APPLICATION_ID=tu_application_id
DISCORD_PUBLIC_KEY=tu_public_key
DATABASE_URL=tu_url_de_neon
DISCORD_GUILD_ID=id_de_tu_servidor
```

Instala dependencias:

```powershell
npm install
```

Registra comandos en tu servidor de pruebas:

```powershell
npm run register:commands:local
```

Con `DISCORD_GUILD_ID` los comandos suelen aparecer casi al instante.

Cuando todo esté probado, puedes registrar comandos globales dejando `DISCORD_GUILD_ID` vacío y ejecutando otra vez el comando. Los globales pueden tardar más en aparecer.

## Paso 9: Invitar el bot al servidor

Usa esta URL, cambiando `TU_APPLICATION_ID`:

```text
https://discord.com/oauth2/authorize?client_id=TU_APPLICATION_ID&permissions=84992&scope=bot%20applications.commands
```

Permisos incluidos:

- View Channels
- Send Messages
- Embed Links
- Read Message History

No necesita Administrator.

## Paso 10: Primera prueba en Discord

En `#almacen-alquimia`:

```text
/inventario nombre:Alquimia
```

Después:

```text
/crear id:1 nombre:Flor de montaña cantidad:50
/sumar id:1 cantidad:101
/restar id:1 cantidad:10
```

Resultado esperado:

```text
Flor de montaña = 60
```

Los comandos `/sumar` y `/restar` responderán de forma efímera.

## Paso 11: Probar separación entre gremios

En `#almacen-alquimia`:

```text
ID 1 = Flor de montaña = 60
```

En `#almacen-leñadores`:

```text
/inventario nombre:Leñadores
/crear id:1 nombre:Leña cantidad:100
/sumar id:1 cantidad:20
```

Resultado esperado:

```text
Alquimia: ID 1 = Flor de montaña = 60
Leñadores: ID 1 = Leña = 120
```

## Backups

La base de datos es persistente, pero debes hacer copias.

Con `pg_dump` instalado:

```bash
pg_dump "postgresql://usuario:password@host.neon.tech/neondb?sslmode=require" > inventarios_backup.sql
```

Guarda ese archivo fuera de Netlify y fuera de Neon:

- Tu PC.
- Google Drive.
- Dropbox.
- Otro servidor.

Hazlo al menos una vez por semana si el servidor usa el bot a menudo.

## Mantenerlo despierto

Con Interactions Endpoint no necesitas mantener un proceso bot vivo. Netlify invoca la función cuando Discord la llama.

Aun así, puedes usar un monitor gratuito para visitar:

```text
https://tu-sitio.netlify.app/health
```

cada 5 o 10 minutos. Esto puede reducir arranques en frío, pero no convierte un plan gratis en garantía 24/7.

## Si ya tienes un juego en Netlify

Puedes usar el mismo sitio del juego.

Tienes que conservar tu configuración actual de build del juego y añadir:

```toml
[functions]
  node_bundler = "esbuild"

[[redirects]]
  from = "/discord-interactions"
  to = "/.netlify/functions/discord-interactions"
  status = 200

[[redirects]]
  from = "/health"
  to = "/.netlify/functions/health"
  status = 200
```

Y copiar estas carpetas:

```text
netlify/functions/
src/netlify/
scripts/register-commands.mjs
```

También añade estas dependencias al `package.json` del juego:

```json
{
  "dependencies": {
    "@neondatabase/serverless": "^1.0.2",
    "tweetnacl": "^1.0.3"
  }
}
```

## Qué opción escoger

Para empezar gratis:

```text
Netlify Functions + Neon PostgreSQL Free
```

Para mantenerlo todo en Netlify:

```text
Netlify Functions + Netlify Database
```

Para más fiabilidad:

```text
Netlify Functions + PostgreSQL de pago
```

Para bot online 24/7 con presencia real:

```text
VPS + bot Python/Docker + PostgreSQL
```
