import http from "http";
import { app } from "./app";
import { env } from "./config/env";
import { initSocket } from "./realtime/socket";

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  console.log(`Run "npm run dev:worker" separately to process hold-release / waitlist-offer / email jobs.`);
});
