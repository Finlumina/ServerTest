// api/process-recording.js
// Receives Twilio's recording callback, fetches the audio, sends it to OpenAI Whisper, and returns TwiML reply.

module.exports = async (req, res) => {
  try {
    // -----------------------
    // 1) Parse body (Twilio sends x-www-form-urlencoded)
    // -----------------------
    let body = req.body || {};
    if (!body || Object.keys(body).length === 0) {
      // raw parsing for urlencoded bodies (works in Vercel)
      const raw = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
      });
      if (raw) {
        const params = new URLSearchParams(raw);
        body = {};
        for (const [k, v] of params) body[k] = v;
      }
    }

    const recordingUrl = body.RecordingUrl; // twilio includes this
    if (!recordingUrl) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Recording not found. Please try again.</Say></Response>`;
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml);
      return;
    }

    // -----------------------
    // 2) Fetch the recording from Twilio (append .wav)
    // -----------------------
    const audioUrl = recordingUrl.endsWith(".wav") ? recordingUrl : recordingUrl + ".wav";

    // Twilio recordings may require basic auth using your Twilio SID:AuthToken
    const sid = process.env.TWILIO_ACCOUNT_SID || "";
    const token = process.env.TWILIO_AUTH_TOKEN || "";
    const authHeader = sid && token ? "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") : undefined;

    const audioResp = await fetch(audioUrl, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    if (!audioResp.ok) {
      console.error("Failed to fetch recording:", audioResp.status, await audioResp.text());
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, could not fetch the recording.</Say></Response>`;
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml);
      return;
    }

    const arrayBuffer = await audioResp.arrayBuffer();
    const fileType = audioResp.headers.get("content-type") || "audio/wav";
    const blob = new Blob([arrayBuffer], { type: fileType });

    // -----------------------
    // 3) Send to OpenAI Whisper (multipart/form-data)
    // -----------------------
    const form = new FormData();
    form.append("file", blob, "recording.wav");
    form.append("model", "whisper-1");

    const openaiResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });

    if (!openaiResp.ok) {
      console.error("OpenAI transcription error:", await openaiResp.text());
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, transcription failed.</Say></Response>`;
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml);
      return;
    }

    const openaiJson = await openaiResp.json();
    const transcription = openaiJson.text || "Sorry, I could not transcribe your message.";

    // sanitize transcription for TwiML <Say>
    const safeText = transcription.replace(/&/g, " and ").replace(/</g, "").replace(/>/g, "");

    // -----------------------
    // 4) Reply to the caller (Twilio will speak this)
    // -----------------------
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. I heard: ${safeText}. Your order has been recorded. Goodbye.</Say>
</Response>`;

    // Optionally: here you can also save `transcription` + metadata to a database,
    // call a webhook to your dashboard, or send a WhatsApp message via Twilio API.

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  } catch (err) {
    console.error("Error in process-recording:", err);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Something went wrong. Please try again later.</Say></Response>`;
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  }
};
