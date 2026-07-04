// OpenRouter transcription helper (no Electron dependency → unit-testable in plain Node).
//
// OpenRouter exposes TWO ways to turn audio into text, both JSON + base64 (NOT the
// multipart /audio/transcriptions shape that OpenAI/Groq use):
//   1. Whisper STT models  → POST /audio/transcriptions  { model, input_audio:{data,format} }
//   2. Audio-capable chat models (Gemini, GPT-4o audio) → POST /chat/completions with an
//      input_audio content part.
// We pick the path from the model id (whisper* → STT, otherwise chat). OpenRouter accepts
// the original recording container (webm, mp3, wav, ogg, m4a, flac, aac) directly, so no
// ffmpeg transcoding is required.

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "openai/whisper-large-v3-turbo";

const SUPPORTED_FORMATS = new Set(["wav", "mp3", "flac", "m4a", "ogg", "webm", "aac"]);

const MIME_TO_FORMAT = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/oga": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

const EXT_TO_FORMAT = {
  webm: "webm",
  ogg: "ogg",
  oga: "ogg",
  opus: "ogg",
  m4a: "m4a",
  mp4: "m4a",
  aac: "aac",
  mp3: "mp3",
  mpeg: "mp3",
  mpga: "mp3",
  wav: "wav",
  wave: "wav",
  flac: "flac",
};

function resolveAudioFormat({ mimeType, fileName } = {}) {
  if (mimeType) {
    const base = String(mimeType).split(";")[0].trim().toLowerCase();
    if (MIME_TO_FORMAT[base]) return MIME_TO_FORMAT[base];
  }
  if (fileName) {
    const ext = String(fileName).split(".").pop().toLowerCase();
    if (EXT_TO_FORMAT[ext]) return EXT_TO_FORMAT[ext];
  }
  return "webm";
}

function isWhisperModel(model) {
  return /whisper/i.test(model || "");
}

const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://openwhispr.com",
  "X-Title": "OpenWhispr",
});

async function transcribeWithOpenRouter({
  audioBuffer,
  model,
  language,
  prompt,
  apiKey,
  mimeType,
  fileName,
  fetchImpl,
} = {}) {
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error("OpenRouter API key not configured. Add it in Settings.");
    err.code = "API_KEY_MISSING";
    throw err;
  }

  const doFetch = fetchImpl || globalThis.fetch;
  const base64Audio = Buffer.from(audioBuffer).toString("base64");
  let format = resolveAudioFormat({ mimeType, fileName });
  if (!SUPPORTED_FORMATS.has(format)) format = "webm";

  const resolvedModel = model || OPENROUTER_DEFAULT_MODEL;
  const hasLanguage = language && language !== "auto";

  if (isWhisperModel(resolvedModel)) {
    const body = { model: resolvedModel, input_audio: { data: base64Audio, format } };
    if (hasLanguage) body.language = language;
    if (prompt && prompt.trim()) body.prompt = prompt.trim();

    const response = await doFetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: OPENROUTER_HEADERS(apiKey),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter STT error ${response.status}: ${errorText}`);
    }
    const json = await response.json();
    return { text: typeof json?.text === "string" ? json.text.trim() : "" };
  }

  // Audio-capable chat model (Gemini, GPT-4o audio).
  const languageHint = hasLanguage ? ` The spoken language is "${language}".` : "";
  const dictionaryHint =
    prompt && prompt.trim()
      ? ` These terms may appear, spell them correctly: ${prompt.trim()}.`
      : "";

  const body = {
    model: resolvedModel,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are a speech-to-text engine. Transcribe the audio verbatim. " +
          "Return only the transcription text with no commentary, labels, or quotation marks. " +
          "If there is no intelligible speech, return an empty string.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Transcribe this audio.${languageHint}${dictionaryHint}` },
          { type: "input_audio", input_audio: { data: base64Audio, format } },
        ],
      },
    ],
  };

  const response = await doFetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: OPENROUTER_HEADERS(apiKey),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter chat error ${response.status}: ${errorText}`);
  }
  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content;
  return { text: typeof text === "string" ? text.trim() : "" };
}

module.exports = {
  transcribeWithOpenRouter,
  resolveAudioFormat,
  isWhisperModel,
  OPENROUTER_BASE,
  OPENROUTER_DEFAULT_MODEL,
};
