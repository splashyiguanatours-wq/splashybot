const express = require("express");
const axios = require("axios");
const twilio = require("twilio");
const { v5: uuidv5 } = require("uuid");

const app = express();

// Twilio sends form-urlencoded by default
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const { MessagingResponse } = twilio.twiml;

// Keep this constant forever (or set it as env var)
const CHAT_NAMESPACE =
  process.env.CHAT_NAMESPACE || "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

// In-memory cache so we don't create the same chat every message (resets on deploy)
const initializedChats = new Set();

function requireEnv(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

async function ensureChatExists(chatId) {
  if (initializedChats.has(chatId)) return;

  const url = `https://api.synthflow.ai/v2/chat/${chatId}`;
  const bodyObj = { model_id: process.env.SYNTHFLOW_AGENT_ID };
  const bodyStr = JSON.stringify(bodyObj);

  await axios({
    method: "POST",
    url,
    data: bodyStr,
    headers: {
      Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 12000,
  });

  initializedChats.add(chatId);
}

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = (req.body?.Body || "").trim();
  const from = (req.body?.From || "").trim();

  console.log("INBOUND", { from, incomingMsg });

  const twiml = new MessagingResponse();

  if (!requireEnv("SYNTHFLOW_API_KEY") || !requireEnv("SYNTHFLOW_AGENT_ID")) {
    twiml.message("Setup issue: missing SYNTHFLOW_API_KEY or SYNTHFLOW_AGENT_ID.");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // If user sends media/sticker, Body can be empty
  const safeMsg = incomingMsg.length
    ? incomingMsg
    : "User sent something with no text (maybe a photo/sticker). Ask what they need.";

  // Deterministic UUID per WhatsApp sender
  const chatId = uuidv5(from, CHAT_NAMESPACE);

  try {
    // 1) Ensure chat exists
    await ensureChatExists(chatId);

    // 2) Send message (FORCE JSON STRING)
    const url = `https://api.synthflow.ai/v2/chat/${chatId}/messages`;
    const payloadObj = { message: safeMsg };
    const payloadStr = JSON.stringify(payloadObj);

    console.log("OUTBOUND_TO_SYNTHFLOW", { url, payloadObj });

    const synthRes = await axios({
      method: "POST",
      url,
      data: payloadStr,
      headers: {
        Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 12000,
    });

    const reply =
      synthRes.data?.response?.agent_message ||
      synthRes.data?.agent_message ||
      synthRes.data?.message ||
      "Sorry — I had a small technical issue. Please try again.";

    twiml.message(reply);
    res.type("text/xml");
    return res.send(twiml.toString());
  } catch (err) {
    console.error(
      "SYNTHFLOW_ERROR",
      err?.response?.status,
      err?.response?.data || err.message
    );

    // allow retry of chat init after any failure
    initializedChats.delete(chatId);

    twiml.message("Sorry — I had a small technical issue. Please try again in a moment 🙂");
    res.type("text/xml");
    return res.send(twiml.toString());
  }
});

app.get("/", (req, res) => {
  res.send("SplashyBot is running!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
