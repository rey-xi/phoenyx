import app from "./app.js";
import { activateTelegramBot } from "./clients/grammy.client.js";
import { startTelegramPolling } from "./methods/telegram.methods.js";

const port = Number(process.env.PORT ?? 3001);

void startTelegramPolling().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Telegram local polling could not be started.",
  );
});

void activateTelegramBot().catch((error: unknown) => {
  console.error("Telegram bot activation failed:", error);
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
