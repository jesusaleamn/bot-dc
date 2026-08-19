# Netlify sin GitHub

Sí, puedes subirlo sin GitHub.

Para este bot no recomiendo arrastrar la carpeta a Netlify Drop, porque necesitamos `Netlify Functions` con dependencias de Node. La forma correcta sin GitHub es usar `Netlify CLI`.

## Qué harás

```text
Tu PC -> Netlify CLI -> Netlify
```

Después de desplegar, tu PC ya no tiene que estar encendido. Solo lo usas para subir cambios.

## 1. Preparar datos

Necesitas estos valores:

```text
DISCORD_TOKEN
DISCORD_APPLICATION_ID
DISCORD_PUBLIC_KEY
DATABASE_URL
```

`DATABASE_URL` sale de Neon.

## 2. Instalar dependencias

En PowerShell, dentro de esta carpeta:

```powershell
npm install
```

## 3. Crear archivo local

```powershell
npm run prepare:netlify
```

Rellena los datos que te pida.

Esto crea:

```text
.env.netlify.local
```

Ese archivo no se sube a internet. Solo sirve para tu PC.

## 4. Iniciar sesión en Netlify

```powershell
npm run netlify:login
```

Se abrirá el navegador. Inicia sesión en Netlify y autoriza la CLI.

## 5. Crear sitio en Netlify sin GitHub

Cambia `mi-bot-inventarios` por un nombre único:

```powershell
npm run netlify:create -- --name mi-bot-inventarios
```

Si el nombre ya existe, usa otro.

## 6. Subir variables a Netlify

Opción más fácil:

```powershell
npm run netlify:env:import
```

Eso sube a Netlify las variables de `.env.netlify.local`.

Opción manual desde la web:

```text
Netlify -> tu sitio -> Site configuration -> Environment variables
```

Añade:

```env
DISCORD_TOKEN=tu_token
DISCORD_APPLICATION_ID=tu_application_id
DISCORD_PUBLIC_KEY=tu_public_key
DATABASE_URL=tu_url_de_neon
DISCORD_GUILD_ID=id_de_tu_servidor_opcional
```

## 7. Desplegar a producción

```powershell
npm run netlify:deploy:prod
```

Al terminar, Netlify te dará una URL parecida a:

```text
https://mi-bot-inventarios.netlify.app
```

## 8. Probar health

Abre:

```text
https://mi-bot-inventarios.netlify.app/health
```

Debe responder:

```json
{"status":"ok","service":"discord-guild-inventory-netlify"}
```

## 9. Poner endpoint en Discord

En Discord Developer Portal:

```text
General Information -> Interactions Endpoint URL
```

Pega:

```text
https://mi-bot-inventarios.netlify.app/discord-interactions
```

Guarda.

Discord validará la URL automáticamente.

## 10. Registrar comandos

```powershell
npm run register:commands:local
```

## 11. Invitar el bot

Cambia `TU_APPLICATION_ID`:

```text
https://discord.com/oauth2/authorize?client_id=TU_APPLICATION_ID&permissions=84992&scope=bot%20applications.commands
```

## 12. Probar en Discord

En `#almacen-alquimia`:

```text
/inventario nombre:Alquimia
/crear id:1 nombre:Flor de montaña cantidad:50
/sumar id:1 cantidad:20
/restar id:1 cantidad:10
```

## Para actualizar el bot después

Cada vez que cambies archivos:

```powershell
npm run netlify:deploy:prod
```

No necesitas GitHub.

