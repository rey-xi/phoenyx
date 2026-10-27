import app from "./app";
import { startTelegramPolling } from "./methods/telegram.methods";

const port = Number(process.env.PORT ?? 3001);

void startTelegramPolling().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Telegram local polling could not be started.",
  );
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
