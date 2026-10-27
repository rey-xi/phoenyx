import { Router } from "express";
import { telegramHandler } from "../handlers/telegram.handlers";

const router = Router();
router.post("/webhook", telegramHandler);

export default router;
