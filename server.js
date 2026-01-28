const express = require("express");
const axios = require("axios");
const twilio = require("twilio");

const app = express();

// Twilio sends form-urlencoded by default
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const { MessagingResponse } = twilio.twiml;

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = (req.body?.Body || "").trim();
  const from = (req.body?.From || "").trim();

  console.log("INBOUND", { from, incomingMsg });

  const twiml = new MessagingResponse();

  if (!incomingMsg) {
    twiml.message("Please type a message and send again 🙂");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (!process.env.SYNTHFLOW_API_KEY || !process.env.SYNTHFLOW_AGENT_ID) {
    twiml.message("Setup issue: missing SYNTHFLOW_API_KEY or SYNTHFLOW_AGENT_ID.");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  try {
    // 1) Send message to Synthflow
    const chatId = encodeURIComponent(from); // keep it simple
    const synthRes = await axios.post(
      `https://api.synthflow.ai/v2/chat/${chatId}/messages`,
      { message: incomingMsg },
      {
        headers: {
          Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000, // Render allows this, Twilio Functions did not
      }
    );

    const reply =
      synthRes.data?.response?.agent_message ||
      synthRes.data?.agent_message ||
      synthRes.data?.message ||
      "Sorry — I had a small technical issue. Please try again.";

    twiml.message(reply);
    res.type("text/xml");
    return res.send(twiml.toString());
  } catch (err) {
    console.error("SYNTHFLOW_ERROR", err?.response?.status, err?.response?.data || err.message);
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
