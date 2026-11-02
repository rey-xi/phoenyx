import "dotenv/config";

import express from "express";
import deviceRoutes from "./routes/device.routes.js";
import leadRoutes from "./routes/lead.routes.js";
import telegramRoutes from "./routes/telegram.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.use("/api/device", deviceRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/telegram", telegramRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
