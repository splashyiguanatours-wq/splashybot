const express = require("express");
const axios = require("axios");
const twilio = require("twilio");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const MessagingResponse = twilio.twiml.MessagingResponse;

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;

  console.log("Incoming message:", incomingMsg);

  const twiml = new MessagingResponse();

  try {
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Splashy Iguana Tours' friendly WhatsApp assistant. Answer questions about the amphibious tour, pricing, safety, bookings, and experience in a warm, helpful tone.",
          },
          {
            role: "user",
            content: incomingMsg,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const reply = aiResponse.data.choices[0].message.content;

    twiml.message(reply);
  } catch (error) {
    console.error("AI Error:", error.response?.data || error.message);
    twiml.message(
      "Sorry — I had a small technical issue. Please try again in a moment."
    );
  }

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

app.get("/", (req, res) => {
  res.send("SplashyBot is running!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
