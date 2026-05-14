import * as scriptLanguageService from '../../services/tenant/scriptLanguageService.js';

export function getStatus(req, res, next) {
  try {
    res.json({ data: scriptLanguageService.getScriptLanguageStatus() });
  } catch (err) {
    next(err);
  }
}

export async function translate(req, res, next) {
  try {
    const { text, source, target } = req.body || {};
    const result = await scriptLanguageService.translateText({
      text,
      source,
      target,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function transcribe(req, res, next) {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Audio file is required (field name: audio).' });
    }
    const language = (req.body && req.body.language) || '';
    const result = await scriptLanguageService.transcribeAudioBuffer({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      language,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function tts(req, res, next) {
  try {
    const { text, locale } = req.body || {};
    const { buffer, contentType } = await scriptLanguageService.textToSpeech({ text, locale });
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}
