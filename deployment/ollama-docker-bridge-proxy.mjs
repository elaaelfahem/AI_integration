import http from "node:http";

const listenHost = process.env.LISTEN_HOST || "172.18.0.1";
const listenPort = Number(process.env.LISTEN_PORT || "11434");
const targetHost = "127.0.0.1";
const targetPort = 11434;

const server = http.createServer((request, response) => {
  const upstream = http.request(
    {
      hostname: targetHost,
      port: targetPort,
      path: request.url,
      method: request.method,
      headers: request.headers,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode || 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "application/json" });
    }
    response.end(JSON.stringify({ error: "Ollama upstream unavailable" }));
    console.error(error.message);
  });

  request.pipe(upstream);
});

server.listen(listenPort, listenHost, () => {
  console.log(
    `Ollama Docker bridge proxy listening on http://${listenHost}:${listenPort}`,
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
