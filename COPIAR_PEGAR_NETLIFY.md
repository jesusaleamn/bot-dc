# Netlify: guía mínima de copiar y pegar

Esta es la ruta más corta para subirlo a internet con Netlify.

Si quieres el camino recomendado con GitHub, Netlify y una página con botón de invitación, usa [GUIA_FACIL_GITHUB_NETLIFY_DISCORD.md](GUIA_FACIL_GITHUB_NETLIFY_DISCORD.md).

Arquitectura:

```text
Discord -> Netlify Functions -> Neon PostgreSQL -> Discord REST API
```

No dependes de tu PC. La base de datos vive en Neon, no en el disco de Netlify.

## 0. Necesitas estos 4 datos

Antes de pegar comandos, consigue:

```text
DISCORD_TOKEN
DISCORD_APPLICATION_ID
DISCORD_PUBLIC_KEY
DATABASE_URL
```

De Discord salen los tres primeros. De Neon sale `DATABASE_URL`.

## 1. Discord

Entra aquí:

```text
https://discord.com/developers/applications
```

Haz esto:

1. `New Application`.
2. `General Information` -> copia `Application ID`.
3. `General Information` -> copia `Public Key`.
4. `Bot` -> crea el bot.
5. `Bot` -> `Reset Token` o `View Token` -> copia el token.

No actives intents privilegiados.

## 2. Neon

Entra aquí:

```text
https://neon.com
```

Haz esto:

1. Crea cuenta.
2. Crea un proyecto PostgreSQL.
3. Pulsa `Connect`.
4. Copia la URL.

Debe parecerse a:

```text
postgresql://usuario:password@host.neon.tech/neondb?sslmode=require
```

## 3. Prepara el archivo local

En PowerShell, dentro de esta carpeta:

```powershell
npm install
npm run prepare:netlify
```

El script te preguntará:

```text
DISCORD_TOKEN
DISCORD_APPLICATION_ID
DISCORD_PUBLIC_KEY
DATABASE_URL de Neon
DISCORD_GUILD_ID
URL de Netlify
```

`DISCORD_GUILD_ID` es opcional, pero recomendado para probar. Es el ID de tu servidor Discord.

Si todavía no tienes URL de Netlify, deja esa pregunta vacía.

## 4. Sube el proyecto a GitHub

Si no quieres usar GitHub, salta esta sección y usa [NETLIFY_SIN_GITHUB.md](NETLIFY_SIN_GITHUB.md).

Si todavía no has creado repositorio:

```powershell
git init
git add .
git commit -m "Bot inventario Discord Netlify"
```

Crea un repositorio en GitHub y luego pega los comandos que GitHub te dé. Serán parecidos a:

```powershell
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git branch -M main
git push -u origin main
```

No subas `.env.netlify.local`. Ya está ignorado.

## 5. Netlify

Entra aquí:

```text
https://app.netlify.com
```

Haz esto:

1. `Add new site`.
2. `Import an existing project`.
3. Conecta GitHub.
4. Selecciona el repo.
5. Deploy.

Netlify usará:

```text
netlify.toml
public/
netlify/functions/
```

## 6. Variables en Netlify

En tu sitio de Netlify:

```text
Site configuration -> Environment variables -> Add a variable
```

Añade una por una:

```env
DISCORD_TOKEN=TU_TOKEN
DISCORD_APPLICATION_ID=TU_APPLICATION_ID
DISCORD_PUBLIC_KEY=TU_PUBLIC_KEY
DATABASE_URL=TU_DATABASE_URL_DE_NEON
```

Opcional:

```env
DISCORD_GUILD_ID=ID_DE_TU_SERVIDOR
```

Luego:

```text
Deploys -> Trigger deploy -> Deploy site
```

## 7. Prueba Netlify

Abre:

```text
https://TU-SITIO.netlify.app/health
```

Debe responder:

```json
{"status":"ok","service":"discord-guild-inventory-netlify"}
```

## 8. Discord Interactions Endpoint

En Discord Developer Portal:

```text
General Information -> Interactions Endpoint URL
```

Pega:

```text
https://TU-SITIO.netlify.app/discord-interactions
```

Guarda.

Si Discord acepta la URL, el endpoint está bien.

## 9. Registrar comandos

En PowerShell:

```powershell
npm run register:commands:local
```

Si pusiste `DISCORD_GUILD_ID`, los comandos salen rápido en ese servidor.

## 10. Invitar el bot

Abre esta URL cambiando `TU_APPLICATION_ID`:

```text
https://discord.com/oauth2/authorize?client_id=TU_APPLICATION_ID&permissions=84992&scope=bot%20applications.commands
```

Invítalo a tu servidor.

## 11. Primera prueba

En Discord, dentro de `#almacen-alquimia`:

```text
/inventario nombre:Alquimia
/crear id:1 nombre:Flor de montaña cantidad:50
/sumar id:1 cantidad:20
/restar id:1 cantidad:10
```

Debe quedar:

```text
Flor de montaña = 60
```

## 12. Separación por canal

En `#almacen-leñadores`:

```text
/inventario nombre:Leñadores
/crear id:1 nombre:Leña cantidad:100
/sumar id:1 cantidad:20
```

Resultado:

```text
Alquimia: ID 1 = Flor de montaña = 60
Leñadores: ID 1 = Leña = 120
```

## Comandos útiles

Pruebas locales de la versión Netlify:

```powershell
npm run test:netlify
```

Registrar comandos:

```powershell
npm run register:commands:local
```

Endpoint final:

```text
https://TU-SITIO.netlify.app/discord-interactions
```

Health check:

```text
https://TU-SITIO.netlify.app/health
```
