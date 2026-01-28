const express = require("express");
const axios = require("axios");
const twilio = require("twilio");
const { v5: uuidv5 } = require("uuid");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const { MessagingResponse } = twilio.twiml;

const CHAT_NAMESPACE =
  process.env.CHAT_NAMESPACE || "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function hasEnv(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function synthHeaders() {
  return {
    Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function createChat(chatId) {
  // Create/initialize chat with your agent/model
  const url = `https://api.synthflow.ai/v2/chat/${chatId}`;
  const body = JSON.stringify({ model_id: process.env.SYNTHFLOW_AGENT_ID });

  return axios({
    method: "POST",
    url,
    data: body,
    headers: synthHeaders(),
    timeout: 12000,
  });
}

async function sendMessage(chatId, message) {
  const url = `https://api.synthflow.ai/v2/chat/${chatId}/messages`;
  const body = JSON.stringify({ message });

  return axios({
    method: "POST",
    url,
    data: body,
    headers: synthHeaders(),
    timeout: 12000,
  });
}

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = (req.body?.Body || "").trim();
  const from = (req.body?.From || "").trim();

  console.log("INBOUND", { from, incomingMsg });

  const twiml = new MessagingResponse();

  if (!hasEnv("SYNTHFLOW_API_KEY") || !hasEnv("SYNTHFLOW_AGENT_ID")) {
    twiml.message("Setup issue: missing SYNTHFLOW_API_KEY or SYNTHFLOW_AGENT_ID.");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const safeMsg = incomingMsg.length
    ? incomingMsg
    : "User sent something with no text (maybe a photo/sticker). Ask what they need.";

  // Stable chat id per WhatsApp user
  const chatId = uuidv5(from, CHAT_NAMESPACE);

  try {
    // 1) Try send first (best: avoids config conflict)
    let synthRes;
    try {
      synthRes = await sendMessage(chatId, safeMsg);
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;

      // If chat doesn't exist, create then send again
      const description = data?.detail?.description || data?.description || "";
      const notFound =
        status === 404 ||
        /not found/i.test(description) ||
        /chat.*does not exist/i.test(description);

      if (notFound) {
        await createChat(chatId);
        synthRes = await sendMessage(chatId, safeMsg);
      } else {
        // If chat exists with different config, DO NOT recreate — just send again
        const conflict =
          status === 400 && /already exists with different configuration/i.test(description);

        if (conflict) {
          // just attempt message send again without creating chat
          synthRes = await sendMessage(chatId, safeMsg);
        } else {
          throw err;
        }
      }
    }

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
