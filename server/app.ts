import "dotenv/config";

import express from "express";
import leadsRoutes from "./routes/lead.routes";
import telegramRoutes from "./routes/telegram.routes";
import { errorHandler, notFoundHandler } from "./middleware/errors";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.use("/api/leads", leadsRoutes);
app.use("/api/telegram", telegramRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
