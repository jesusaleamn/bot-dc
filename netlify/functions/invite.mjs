const REQUIRED_PERMISSIONS = "84992";


export async function handler() {
  const applicationId = process.env.DISCORD_APPLICATION_ID;

  if (!applicationId) {
    return {
      statusCode: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
      body: "Falta DISCORD_APPLICATION_ID en las variables de entorno de Netlify.",
    };
  }

  const inviteUrl = new URL("https://discord.com/oauth2/authorize");
  inviteUrl.searchParams.set("client_id", applicationId);
  inviteUrl.searchParams.set("permissions", REQUIRED_PERMISSIONS);
  inviteUrl.searchParams.set("scope", "bot applications.commands");

  return {
    statusCode: 302,
    headers: {
      location: inviteUrl.toString(),
      "cache-control": "no-store",
    },
    body: "",
  };
}

