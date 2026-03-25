const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const { HfInference } = require('@huggingface/inference');
const multer = require('multer');
const { toFile } = require('openai/uploads');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static('public'));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' });
const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
const geminiParams = { apiKey: process.env.GEMINI_API_KEY };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const hf = new HfInference(process.env.HF_TOKEN);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, provider, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

        const resolvedProvider = provider || 'openai';

        const streamOpenAIFallback = async (fallbackModel = 'gpt-4o-mini') => {
            const fallbackStream = await openai.chat.completions.create({
                model: fallbackModel,
                messages,
                stream: true,
            });

            for await (const chunk of fallbackStream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
        };

    if (resolvedProvider === 'openai') {
      const stream = await openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    } else if (resolvedProvider === 'deepseek') {
        const stream = await deepseek.chat.completions.create({
          model: model || 'deepseek-chat',
          // simplify format if they used vision but deepseek doesn't support it
          messages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.find(c=>c.type==='text')?.text || '' })),
          stream: true,
        });
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
        } else if (resolvedProvider === 'groq') {
        const stream = await groq.chat.completions.create({
                    model: model || 'llama-3.2-11b-vision-preview',
          messages: messages,
          stream: true,
        });
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
    } else if (resolvedProvider === 'huggingface') {
        try {
            const stream = hf.chatCompletionStream({
                model: model || 'Qwen/Qwen2.5-VL-7B-Instruct',
                messages,
                max_tokens: 1024,
            });

            for await (const chunk of stream) {
                const content = chunk.choices?.[0]?.delta?.content || '';
                if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
        } catch (hfError) {
            res.write(`data: ${JSON.stringify({ text: '\n[Hugging Face stream unavailable. Switched to OpenAI automatically.]\n' })}\n\n`);
            await streamOpenAIFallback('gpt-4o-mini');
        }
    } else if (resolvedProvider === 'gemini') {
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-2.0-flash' });

            const formatGeminiParts = (content) => {
                if (typeof content === 'string') return [{ text: content }];
                return content.map(c => {
                    if (c.type === 'text') return { text: c.text };
                    if (c.type === 'image_url') {
                        const match = c.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
                        return { inlineData: { data: match[2], mimeType: match[1] } };
                    }
                    return null;
                }).filter(Boolean);
            };

            const history = messages.slice(0, -1).map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: formatGeminiParts(m.content)
            }));

            const chat = geminiModel.startChat({ history });
            const lastMessageParts = formatGeminiParts(messages[messages.length - 1].content);
            const result = await chat.sendMessageStream(lastMessageParts);

            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
            }
        } catch (geminiError) {
            // Automatic failover when Gemini quota is exceeded.
            if (geminiError?.status === 429) {
                res.write(`data: ${JSON.stringify({ text: '\n[Gemini quota exceeded. Switched to Qwen on Hugging Face automatically.]\n' })}\n\n`);
                try {
                    const hfFallbackStream = hf.chatCompletionStream({
                        model: 'Qwen/Qwen2.5-VL-7B-Instruct',
                        messages,
                        max_tokens: 1024,
                    });

                    for await (const chunk of hfFallbackStream) {
                        const content = chunk.choices?.[0]?.delta?.content || '';
                        if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                    }
                } catch (hfFallbackError) {
                    res.write(`data: ${JSON.stringify({ text: '\n[Hugging Face fallback unavailable. Trying Groq vision.]\n' })}\n\n`);
                    const fallbackStream = await groq.chat.completions.create({
                        model: 'llama-3.2-11b-vision-preview',
                        messages,
                        stream: true,
                    });

                    for await (const chunk of fallbackStream) {
                        const content = chunk.choices[0]?.delta?.content || '';
                        if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                    }
                }
            } else {
                throw geminiError;
            }
        }
    } else if (resolvedProvider === 'anthropic') {
        const formatAnthropicContent = (content) => {
            if (typeof content === 'string') return content;
            return content.map(c => {
                if (c.type === 'text') return { type: 'text', text: c.text };
                if (c.type === 'image_url') {
                    const match = c.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
                    return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
                }
            });
        };

        const stream = await anthropic.messages.create({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: messages.map(m => ({ role: m.role, content: formatAnthropicContent(m.content) })),
            stream: true,
        });
        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.text) {
                res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
            }
        }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error fetching chat completion:', error);
    res.write(`data: ${JSON.stringify({ error: 'An error occurred while communicating with the AI.' })}\n\n`);
    res.end();
  }
});

// Image Generation Endpoint (using Hugging Face)
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const imageBlob = await hf.textToImage({
            model: 'black-forest-labs/FLUX.1-schnell',
            inputs: prompt,
        });

        const arrayBuffer = await imageBlob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        res.json({ url: `data:image/jpeg;base64,${base64}` });
    } catch (error) {
        console.error('Image Gen Error:', error);
        res.status(500).json({ error: 'Failed to generate image via Hugging Face' });
    }
});

// TTS Endpoint (using Hugging Face)
app.post('/api/tts', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Text is required' });

        const audioBlob = await hf.textToSpeech({
            model: 'facebook/mms-tts-eng',
            inputs: text
        });

        const arrayBuffer = await audioBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        res.setHeader('Content-Type', 'audio/wav');
        res.send(buffer);
    } catch (error) {
        console.error('TTS Error:', error);
        res.status(500).json({ error: 'Failed to generate speech via Hugging Face' });
    }
});

app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Payload too large. Try a smaller image/file or reduce content size.'
        });
    }
    return next(err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`NOVA server online running at http://localhost:${PORT}`);
});

app.post('/api/stt', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Audio file is required' });
        }

        const audioFile = await toFile(
            req.file.buffer,
            req.file.originalname || 'recording.webm',
            { type: req.file.mimetype || 'audio/webm' }
        );

        let transcript;
        let openAIError = null;
        try {
            transcript = await openai.audio.transcriptions.create({
                file: audioFile,
                model: 'gpt-4o-mini-transcribe',
            });
        } catch (primaryError) {
            openAIError = primaryError;
            try {
                // Fallback for accounts/regions without gpt-4o-mini-transcribe access.
                const fallbackFile = await toFile(
                    req.file.buffer,
                    req.file.originalname || 'recording.webm',
                    { type: req.file.mimetype || 'audio/webm' }
                );
                transcript = await openai.audio.transcriptions.create({
                    file: fallbackFile,
                    model: 'whisper-1',
                });
            } catch (secondaryOpenAIError) {
                openAIError = secondaryOpenAIError;

                // Final fallback: Hugging Face ASR (works when OpenAI quota is exceeded).
                const audioBlob = new Blob([req.file.buffer], {
                    type: req.file.mimetype || 'audio/webm',
                });

                const hfResult = await hf.automaticSpeechRecognition({
                    provider: 'hf-inference',
                    model: 'openai/whisper-large-v3',
                    data: audioBlob,
                });

                transcript = { text: hfResult?.text || '' };
            }
        }

        res.json({ text: transcript?.text || '' });
    } catch (error) {
        console.error('STT Error:', {
            message: error?.message,
            status: error?.status,
            code: error?.code,
            type: error?.type,
            openAIMessage: error?.response?.data?.error?.message,
        });
        res.status(500).json({
            error: error?.message || 'Failed to transcribe audio'
        });
    }
});