# Guía fácil: GitHub + Netlify + Discord

Esta es la ruta recomendada.

Resultado final:

```text
Tú mandas una página de Netlify
-> la persona pulsa "Invitar bot a Discord"
-> el bot se instala en el servidor
-> en cada canal usan /inventario y los comandos
```

La página tendrá:

```text
https://botinventariodc.netlify.app
```

Y el botón de instalación usará:

```text
https://TU-SITIO.netlify.app/invite
```

## 1. Crea la app en Discord

Entra aquí:

```text
https://discord.com/developers/applications
```

Haz esto:

1. `New Application`.
2. Pon nombre al bot.
3. En `General Information`, copia:
   - `Application ID`
   - `Public Key`
4. En `Bot`, crea el bot.
5. Copia el token del bot.

Al final tendrás:

```text
DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
DISCORD_TOKEN=
```

## 2. Crea la base de datos en Neon

Entra aquí:

```text
https://neon.com
```

Haz esto:

1. Crea cuenta.
2. Crea un proyecto PostgreSQL.
3. Pulsa `Connect`.
4. Copia la connection string.

Será parecida a:

```text
postgresql://usuario:password@ep-algo.neon.tech/neondb?sslmode=require
```

Ese valor será:

```text
DATABASE_URL=
```

## 3. Prepara el proyecto local

En PowerShell, dentro de esta carpeta:

```powershell
npm install
npm run prepare:netlify
```

Pega los datos cuando te los pida.

Si todavía no tienes la URL de Netlify, deja esa pregunta vacía.

## 4. GitHub

Tu repositorio definitivo es:

```text
https://github.com/jesusaleamn/bot-dc
```

La URL interna de Git termina en `.git`. Eso es normal:

```text
https://github.com/jesusaleamn/bot-dc.git
```

Este proyecto ya está subido a GitHub. Para comprobarlo, en PowerShell:

```powershell
git remote -v
git branch --show-current
git status
```

Debe salir `origin https://github.com/jesusaleamn/bot-dc.git` y la rama debe ser `main`.

Si necesitas volver a conectar esta carpeta con ese repositorio, usa:

```powershell
git remote set-url origin https://github.com/jesusaleamn/bot-dc.git
git branch -M main
git push -u origin main
```

No uses ya los comandos de `echo "# bot-dc" >> README.md` ni `git init` si estás en esta carpeta, porque el repositorio ya existe y ya tiene todos los archivos del bot.

## 5. Conecta GitHub con Netlify

Entra aquí:

```text
https://app.netlify.com
```

Haz esto:

1. `Add new site`.
2. `Import an existing project`.
3. Elige GitHub.
4. Selecciona tu repositorio.
5. Netlify detectará `netlify.toml`.
6. Pulsa `Deploy`.

La configuración correcta es:

```text
Publish directory: public
Functions directory: netlify/functions
Build command: vacío
```

Si Netlify pide build command, pon:

```text
npm install
```

## 6. Pega variables en Netlify

En Netlify:

```text
Site configuration -> Environment variables -> Add a variable
```

Añade estas variables:

```env
DISCORD_TOKEN=TU_TOKEN_REAL
DISCORD_APPLICATION_ID=TU_APPLICATION_ID
DISCORD_PUBLIC_KEY=TU_PUBLIC_KEY
DATABASE_URL=TU_DATABASE_URL_DE_NEON
```

Opcional, pero recomendado para pruebas rápidas:

```env
DISCORD_GUILD_ID=ID_DE_TU_SERVIDOR
```

Después redepliega:

```text
Deploys -> Trigger deploy -> Deploy site
```

## 7. Comprueba la página

Abre:

```text
https://TU-SITIO.netlify.app
```

Debe salir una página con:

```text
Invitar bot a Discord
Comprobar estado
Primer uso
Permisos necesarios
```

Prueba también:

```text
https://botinventariodc.netlify.app/health
```

En `/health`, revisa que salga:

```json
"publicKeyConfigured": true,
"publicKeyValidShape": true
```

También puedes comprobar que el endpoint de Discord existe y valida firmas:

```powershell
curl.exe -i -X POST "https://botinventariodc.netlify.app/discord-interactions" -H "Content-Type: application/json" --data '{"type":1}'
```

Debe devolver `401 invalid request signature`. Eso es correcto: significa que la función existe y rechaza peticiones sin firma de Discord.

Y:

```text
https://botinventariodc.netlify.app/invite
```

`/invite` debe llevarte a Discord para invitar el bot.

## 8. Configura el endpoint de Discord

En Discord Developer Portal:

```text
General Information -> Interactions Endpoint URL
```

Pega:

```text
https://botinventariodc.netlify.app/discord-interactions
```

Guarda.

Si Discord acepta la URL, está bien.

## 9. Registra comandos

En PowerShell:

```powershell
npm run register:commands:local
```

Si pusiste `DISCORD_GUILD_ID`, los comandos aparecerán rápido en tu servidor.

## 10. Instala el bot en Discord

Manda esta página:

```text
https://TU-SITIO.netlify.app
```

La persona pulsa:

```text
Invitar bot a Discord
```

También puedes mandar directamente:

```text
https://TU-SITIO.netlify.app/invite
```

## 11. Primer canal

En el canal `#almacen-alquimia`:

```text
/inventario nombre:Alquimia
/crear id:1 nombre:Flor de montaña cantidad:50
/sumar id:1 cantidad:101
/restar id:1 cantidad:10
```

Resultado:

```text
Flor de montaña = 60
```

## 12. Otro canal

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

## 13. Cuando cambies algo

Solo tienes que hacer:

```powershell
git add .
git commit -m "Actualización"
git push
```

Netlify se actualizará solo.

## Lo que mandas a la gente

Manda esto:

```text
Instala el bot desde aquí:
https://TU-SITIO.netlify.app

Después ve al canal del gremio y usa:
/inventario nombre:Alquimia
/crear id:1 nombre:Flor de montaña cantidad:50
```
