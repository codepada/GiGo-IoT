import express from "express";
import crypto from "crypto";
import axios from "axios";

const app = express();

// เก็บ raw body ไว้ตรวจลายเซ็น
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const ACCESS_TOKEN   = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ตรวจลายเซ็นจาก LINE
function verifySignature(req) {
  const signature = req.headers["x-line-signature"];
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");
  return hash === signature;
}

// ส่ง reply กลับ LINE
async function reply(replyToken, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages: [{ type: "text", text }] },
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
}

// Webhook
app.post("/line/webhook", async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send("Bad signature");
  }

  const events = req.body.events || [];
  for (const e of events) {
    if (e.type === "message" && e.message.type === "text") {
      const text = e.message.text.trim();
      await reply(e.replyToken, `รับแล้ว: ${text}`);
    }
  }
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("OK"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Listening on", port));