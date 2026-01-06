import express from "express";
import crypto from "crypto";
import axios from "axios";
import mqtt from "mqtt";

const app = express();

// ===== LINE CONFIG =====
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const ACCESS_TOKEN   = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ===== MQTT CONFIG =====
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://broker.hivemq.com:1883";
const MQTT_TOPIC  = process.env.MQTT_TOPIC  || "gigo-iot/cmd";

// ===== TEMP STORAGE (ทดสอบก่อน) =====
// LINE userId -> deviceId
const userDeviceMap = {};

// ===== MQTT CLIENT =====
const mqttClient = mqtt.connect(MQTT_BROKER);
mqttClient.on("connect", () => console.log("MQTT connected"));

// ===== MIDDLEWARE (verify signature) =====
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

function verifySignature(req) {
  const signature = req.headers["x-line-signature"];
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");
  return hash === signature;
}

// ===== LINE REPLY =====
async function reply(replyToken, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [{ type: "text", text }]
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`
      }
    }
  );
}

// ===== WEBHOOK =====
app.post("/line/webhook", async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).end();
  }

  for (const event of req.body.events) {
    if (event.type !== "message") continue;
    if (event.message.type !== "text") continue;

    const userId = event.source.userId;
    const text   = event.message.text.trim();

    // ----- SET ID -----
    if (text.startsWith("id=")) {
      const deviceId = text.substring(3).trim();

      if (!deviceId) {
        await reply(event.replyToken, "กรุณาตั้ง id เช่น id=โอเค");
        continue;
      }

      userDeviceMap[userId] = deviceId;
      await reply(event.replyToken, `user id ของคุณคือ: ${deviceId}`);
      continue;
    }

    // ----- SEND COMMAND -----
    const deviceId = userDeviceMap[userId];
    if (!deviceId) {
      await reply(event.replyToken, "กรุณาตั้ง id ก่อน เช่น id=โอเค");
      continue;
    }

    const payload = {
      deviceId: deviceId,
      data: text
    };

    mqttClient.publish(MQTT_TOPIC, JSON.stringify(payload));
    await reply(event.replyToken, `ส่งคำสั่งแล้ว: ${text}`);
  }

  res.sendStatus(200);
});

// ===== HEALTH CHECK =====
app.get("/", (_, res) => res.send("OK"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Listening on", port));
