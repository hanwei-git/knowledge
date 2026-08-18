export class SyncHub implements DurableObject {
  constructor(private ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const payload = await request.text();
      for (const socket of this.ctx.getWebSockets()) {
        socket.send(payload);
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close();
  }
}
