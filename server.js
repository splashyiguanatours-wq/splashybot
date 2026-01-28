const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post("/whatsapp", async (req, res) => {
  try {
    const userMessage = req.body.Body;
    const from = req.body.From;

    const response = await axios.post(
      `https://api.synthflow.ai/v2/chat/${from}/messages`,
      { message: userMessage },
      {
        headers: {
          Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply =
      response.data?.response?.agent_message ||
      response.data?.agent_message ||
      "Sorry, I had a small technical issue.";

    res.type("text/xml");
    res.send(`<Response><Message>${reply}</Message></Response>`);
  } catch (error) {
    console.error(error.message);
    res.type("text/xml");
    res.send(
      `<Response><Message>Sorry — I had a small technical issue. Please try again in a moment 🙂</Message></Response>`
    );
  }
});

app.get("/", (req, res) => {
  res.send("SplashyBot is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
