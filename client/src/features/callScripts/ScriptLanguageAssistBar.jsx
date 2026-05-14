import React, { useCallback, useRef, useState } from 'react';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import {
  SCRIPT_LANGUAGE_OPTIONS,
  plainTextToQuillHtml,
  getSpeechRecognitionLangCode,
} from './scriptLanguageHelpers';
import { scriptLanguageAPI } from '../../services/scriptLanguageAPI';
import styles from './ScriptLanguageAssistBar.module.scss';

function labelForLang(code) {
  return SCRIPT_LANGUAGE_OPTIONS.find((o) => o.value === code)?.label || code;
}

/**
 * Call script language bar: Web Speech (dictation) + speechSynthesis (read-aloud) in the browser;
 * whole-script translation uses `POST /api/tenant/script-language/translate` on the server.
 */
export function ScriptLanguageAssistBar({
  scriptBody,
  setScriptBody,
  editorRef,
  scriptLocale,
  setScriptLocale,
  stripHtml,
  setFormError,
}) {
  const [micBusy, setMicBusy] = useState(false);
  const [translateBusy, setTranslateBusy] = useState(false);
  const [readBusy, setReadBusy] = useState(false);
  const [langChange, setLangChange] = useState(null);
  const recognitionRef = useRef(null);

  const clearError = useCallback(() => setFormError(null), [setFormError]);

  const stopBrowserRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }, []);

  const insertTranscript = useCallback(
    (text) => {
      const chunk = String(text || '').trim();
      if (!chunk) return;
      const spacer = chunk.endsWith('.') || chunk.endsWith('!') || chunk.endsWith('?') ? ' ' : ' ';
      editorRef.current?.insertAtCursor(`${chunk}${spacer}`);
      editorRef.current?.focus();
    },
    [editorRef]
  );

  const startBrowserRecognition = useCallback(() => {
    const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Rec) {
      setFormError('Speech recognition is not available in this browser. Try Chrome or Edge.');
      return;
    }
    clearError();
    const rec = new Rec();
    rec.lang = getSpeechRecognitionLangCode(scriptLocale);
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev) => {
      let said = '';
      for (let i = 0; i < ev.results.length; i += 1) {
        said += ev.results[i][0].transcript;
      }
      insertTranscript(said);
      setMicBusy(false);
      recognitionRef.current = null;
    };
    rec.onerror = (ev) => {
      setMicBusy(false);
      recognitionRef.current = null;
      const msg = ev.error === 'not-allowed' ? 'Microphone permission denied.' : `Speech recognition error: ${ev.error || 'unknown'}`;
      setFormError(msg);
    };
    rec.onend = () => {
      if (recognitionRef.current === rec) {
        setMicBusy(false);
        recognitionRef.current = null;
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      setMicBusy(false);
      recognitionRef.current = null;
      setFormError(err?.message || 'Could not start speech recognition.');
    }
  }, [clearError, insertTranscript, scriptLocale, setFormError]);

  const toggleMic = useCallback(() => {
    if (micBusy) {
      stopBrowserRecognition();
      setMicBusy(false);
      return;
    }
    clearError();
    setMicBusy(true);
    startBrowserRecognition();
  }, [clearError, micBusy, setFormError, startBrowserRecognition, stopBrowserRecognition]);

  const readAloud = useCallback(() => {
    const text = stripHtml(scriptBody || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) {
      setFormError('Nothing to read — add script text first.');
      return;
    }
    clearError();

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setFormError('Speech synthesis is not available in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = getSpeechRecognitionLangCode(scriptLocale);
    u.onend = () => setReadBusy(false);
    u.onerror = () => {
      setReadBusy(false);
      setFormError('Speech synthesis failed.');
    };
    setReadBusy(true);
    window.speechSynthesis.speak(u);
  }, [clearError, scriptBody, scriptLocale, setFormError, stripHtml]);

  const handleLocaleChange = useCallback(
    (e) => {
      const next = String(e.target.value || '');
      if (!next || next === scriptLocale) return;
      const plain = stripHtml(scriptBody || '').trim();
      if (!plain) {
        setScriptLocale(next);
        clearError();
        return;
      }
      setLangChange({ from: scriptLocale, to: next });
    },
    [clearError, scriptBody, scriptLocale, setScriptLocale, stripHtml]
  );

  const confirmLanguageChange = useCallback(async () => {
    if (!langChange) return;
    const { from, to } = langChange;
    setTranslateBusy(true);
    clearError();
    try {
      const plain = stripHtml(scriptBody || '');
      const res = await scriptLanguageAPI.translate({ text: plain, source: from, target: to });
      const translated = res?.data?.data?.translatedText;
      if (typeof translated !== 'string') {
        throw new Error('Unexpected translation response from server.');
      }
      setScriptBody(plainTextToQuillHtml(translated));
      setScriptLocale(to);
      setLangChange(null);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Translation failed';
      setFormError(msg);
    } finally {
      setTranslateBusy(false);
    }
  }, [clearError, langChange, scriptBody, setFormError, setScriptBody, setScriptLocale, stripHtml]);

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <div className={styles.langSelect}>
          <Select
            label="Script language"
            hint="Voice and read-aloud use the browser. Changing language can translate the whole script on the server (may take a while for long scripts)."
            options={SCRIPT_LANGUAGE_OPTIONS}
            value={scriptLocale}
            onChange={handleLocaleChange}
            compact
            searchable
            wrapperClassName={styles.selectWrap}
          />
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            variant={micBusy ? 'secondary' : 'ghost'}
            size="sm"
            onClick={toggleMic}
            title={micBusy ? 'Stop listening' : 'Dictate with browser speech recognition'}
          >
            {micBusy ? 'Stop' : 'Voice'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={readAloud}
            disabled={readBusy}
            loading={readBusy}
            title="Read script with browser speech synthesis"
          >
            Read aloud
          </Button>
        </div>
      </div>
      <p className={styles.hint}>
        Voice and read aloud use the Web Speech API in your browser. Whole-script translation runs on the server
        (LibreTranslate if configured, otherwise built-in NLLB).
      </p>

      <ConfirmModal
        isOpen={!!langChange}
        onClose={() => !translateBusy && setLangChange(null)}
        onConfirm={confirmLanguageChange}
        title="Translate entire script?"
        message={
          langChange
            ? `Replace the script body with a translation from ${labelForLang(langChange.from)} to ${labelForLang(langChange.to)}? Merge fields like {{contact_first_name}} are preserved as plain text. Translation runs on the server and may take a while.`
            : ''
        }
        confirmText="Translate"
        loading={translateBusy}
      />
    </div>
  );
}
