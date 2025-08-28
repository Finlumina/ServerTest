// api/voice.js
// This endpoint returns TwiML to record the caller and POST the recording to /api/process-recording

module.exports = (req, res) => {
  // Twilio may call with GET or POST depending on config
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  // Build absolute URL for the /api/process-recording (works on Vercel)
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const actionUrl = `${proto}://${host}/api/process-recording`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Assalamualaikum. This call may be answered by an AI assistant and recorded for order processing. Please speak after the beep. Press star to finish.</Say>
  <Record action="${actionUrl}" method="POST" maxLength="120" playBeep="true" finishOnKey="*" />
  <Say voice="alice">We did not receive a recording. Goodbye.</Say>
</Response>`;

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml);
};
