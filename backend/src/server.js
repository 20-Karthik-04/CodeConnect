import express from "express";
import path from "path";
import cors from "cors";
import { serve } from "inngest/express";
import { clerkMiddleware, clerkClient } from "@clerk/express";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";
import Session from "./models/Session.js";
import User from "./models/User.js";
import { ENV } from "./lib/env.js";
import { connectDB } from "./lib/db.js";
import { inngest, functions } from "./lib/inngest.js";

import chatRoutes from "./routes/chatRoutes.js";
import sessionRoutes from "./routes/sessionRoute.js";
import executeRoute from "./routes/executeRoute.js";

const app = express();

const __dirname = path.resolve();

// middleware
app.use(express.json());
// credentials:true meaning?? => server allows a browser to include cookies on request
app.use(cors({ origin: ENV.CLIENT_URL, credentials: true }));
app.use(clerkMiddleware()); // this adds auth field to request object: req.auth()

app.use("/api/inngest", serve({ client: inngest, functions }));
app.use("/api/chat", chatRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/execute", executeRoute);

app.get("/health", (req, res) => {
  res.status(200).json({ msg: "api is up and running" });
});

// make our app ready for deployment
if (ENV.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("/{*any}", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

const startServer = async () => {
  try {
    await connectDB();
    const server = app.listen(ENV.PORT, () => console.log("Server is running on port:", ENV.PORT));

    // WebSocket configuration for Yjs collaborative editing
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", async (request, socket, head) => {
      try {
        const url = new URL(request.url, `ws://${request.headers.host}`);
        if (!url.pathname.startsWith("/api/collaboration/")) {
          // not a collaboration request, could be something else but we don't have other WS endpoints
          return socket.destroy();
        }

        const callId = url.pathname.split("/").pop();
        const token = url.searchParams.get("token");

        if (!token) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          return socket.destroy();
        }

        // SECURITY NOTE (Interview Detail):
        // Currently using query params for simplicity. In production, we'd move authentication 
        // to a post-connection handshake (e.g. initial message with token) or use secure HttpOnly 
        // cookies to prevent tokens from being logged by proxies or LB access logs.
        // 
        // SCALING NOTE: 
        // For multi-instance horizontal scaling, we would introduce a shared state layer 
        // like Redis (e.g. y-redis or standard Pub/Sub) for awareness broadcasting and updates,
        // rather than storing them in memory on a single instance.
        const decoded = await clerkClient.verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
        const clerkId = decoded.sub;

        const session = await Session.findOne({ callId });
        if (!session) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          return socket.destroy();
        }

        const user = await User.findOne({ clerkId });
        if (!user) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          return socket.destroy();
        }

        const isHost = session.host?.toString() === user._id.toString();
        const isParticipant = session.participant?.toString() === user._id.toString();

        if (!isHost && !isParticipant) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          return socket.destroy();
        }

        // Setup Document Routing
        // y-websocket utilizes the `request.url` to determine the document name.
        // We override request.url to match just the callId.
        request.url = `/${callId}`;

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } catch (err) {
        console.error("WS Upgrade Error:", err);
        socket.write("HTTP/1.1 500 Internal Error\r\n\r\n");
        socket.destroy();
      }
    });

    wss.on("connection", (ws, req) => {
      // MEMORY LEAK PREVENTION (Interview Detail): 
      // y-websocket automatically cleans up and garbage collects the Y.Doc 
      // when the last connected client leaves the room. No manual interval cleanup needed.
      setupWSConnection(ws, req);
    });
  } catch (error) {
    console.error("💥 Error starting the server", error);
  }
};

startServer();

