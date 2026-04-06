import { loadConfig } from "./config.js";
import { createApp } from "./server.js";

const config = loadConfig();
const { server } = createApp(config);

server.listen(config.port, () => {
  console.log(
    `Signaling server listening on port ${config.port} [${config.nodeEnv}]`,
  );
});
