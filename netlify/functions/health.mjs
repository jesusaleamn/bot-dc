export async function handler() {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      status: "ok",
      service: "discord-guild-inventory-netlify",
    }),
  };
}

