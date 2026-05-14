import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useTemplateVariables } from '../../hooks/useTemplateVariables';
import styles from './ScriptBodyEditor.module.scss';

const getBundledQuill = () => ReactQuill.Quill;

/** Insert HTML at caret inside a contenteditable root (Visual + tables path). */
function insertHtmlAtCaretInElement(rootEl, htmlString) {
  const html = String(htmlString ?? '');
  if (!rootEl || !html) return;
  rootEl.focus();
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (rootEl.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      const frag = range.createContextualFragment(html);
      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  }
  const wrap = document.createElement('span');
  wrap.innerHTML = html;
  while (wrap.firstChild) {
    rootEl.appendChild(wrap.firstChild);
  }
}

export const ScriptBodyEditor = forwardRef(function ScriptBodyEditor(
  {
    value = '',
    onChange,
    onEditorState,
    placeholder,
    /**
     * When not null, Variable menu uses only these groups (e.g. meeting placeholders).
     * Pass [] to disable CRM variables when placeholders are not loaded yet.
     */
    variableGroups = null,
    compact = false,
    readOnly = false,
    /** Hide toolbar "Variable" when merge fields are provided elsewhere (e.g. meeting email chips). */
    hideVariableMenu = false,
    /** Fixed frame with vertical scroll inside the editor (no drag resize). For dense modals. */
    scrollableLayout = false,
    /** Shorter fixed frame with compact toolbar (campaign wizard channel step). */
    denseScrollLayout = false,
    /** Show Visual / HTML source toggle (raw HTML for email templates). */
    enableHtmlSourceToggle = false,
  },
  ref
) {
  const quillRef = useRef(null);
  const htmlTextareaRef = useRef(null);
  const toolbarId = useMemo(() => `quill-toolbar-${Math.random().toString(36).slice(2)}`, []);
  const { grouped, moduleOrder, moduleLabels, loading: varsLoading } = useTemplateVariables();
  const [htmlSourceMode, setHtmlSourceMode] = useState(false);

  /** True when showing the raw HTML textarea (exclusive with Quill visual editor). */
  const inHtmlEditor = Boolean(enableHtmlSourceToggle && htmlSourceMode);

  /** Quill cannot preserve `<table>`; Visual uses a contenteditable surface for real HTML editing. */
  const bodyHasTable = useMemo(() => /<table\b/i.test(String(value ?? '')), [value]);
  const visualIsRenderedPreview = Boolean(
    enableHtmlSourceToggle && !htmlSourceMode && bodyHasTable
  );

  const visualTableEditableRef = useRef(null);

  const [varMenuOpen, setVarMenuOpen] = useState(false);
  const varMenuWrapRef = useRef(null);
  const varBtnRef = useRef(null);
  const varMenuRef = useRef(null);
  const [varMenuPos, setVarMenuPos] = useState(null);

  const getQuill = useCallback(() => {
    return quillRef.current?.getEditor?.() ?? null;
  }, []);

  const variableOptions = useMemo(() => {
    if (variableGroups != null) {
      return (variableGroups || [])
        .map((g) => ({
          moduleKey: g.moduleKey || 'custom',
          label: g.label || 'Variables',
          list: (g.list || []).filter((v) => v?.key),
        }))
        .filter((g) => g.list.length > 0);
    }
    return moduleOrder
      .map((moduleKey) => {
        const list = grouped[moduleKey] || [];
        return {
          moduleKey,
          label: moduleLabels[moduleKey] || moduleKey,
          list: list.filter((v) => v?.key),
        };
      })
      .filter((g) => g.list.length > 0);
  }, [variableGroups, grouped, moduleOrder, moduleLabels]);

  const varsLoadingEffective = variableGroups != null ? false : varsLoading;

  const emitFromVisualTableEditor = useCallback(() => {
    const el = visualTableEditableRef.current;
    if (!el) return;
    const html = el.innerHTML;
    onChange?.(html);
    const plain = el.innerText ?? '';
    onEditorState?.(plain, plain.length);
  }, [onChange, onEditorState]);

  /** Sync external `value` into the contenteditable when not focused (e.g. reset / tab switch). */
  useLayoutEffect(() => {
    if (!visualIsRenderedPreview || !visualTableEditableRef.current) return;
    const el = visualTableEditableRef.current;
    if (document.activeElement === el) return;
    const next = value ?? '';
    if ((el.innerHTML || '') !== next) {
      el.innerHTML = next;
    }
  }, [value, visualIsRenderedPreview]);

  useImperativeHandle(ref, () => ({
    insertAtCursor(text) {
      if (inHtmlEditor && htmlTextareaRef.current) {
        const ta = htmlTextareaRef.current;
        const start = typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length;
        const end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : start;
        const next = `${ta.value.slice(0, start)}${text}${ta.value.slice(end)}`;
        onChange?.(next);
        requestAnimationFrame(() => {
          ta.focus();
          const pos = start + text.length;
          ta.setSelectionRange(pos, pos);
        });
        return;
      }
      if (enableHtmlSourceToggle && !htmlSourceMode && bodyHasTable && visualTableEditableRef.current) {
        insertHtmlAtCaretInElement(visualTableEditableRef.current, String(text ?? ''));
        emitFromVisualTableEditor();
        return;
      }
      const quill = getQuill();
      if (!quill) return;
      const sel = quill.getSelection(true);
      const index = sel ? sel.index : quill.getLength();
      quill.insertText(index, text);
      quill.setSelection(index + text.length);
    },
    replaceRange(startIndex, endIndex, text) {
      const quill = getQuill();
      if (!quill) return;
      quill.deleteText(startIndex, endIndex - startIndex);
      quill.insertText(startIndex, text);
      quill.setSelection(startIndex + text.length);
    },
    focus() {
      if (inHtmlEditor) {
        htmlTextareaRef.current?.focus();
        return;
      }
      if (enableHtmlSourceToggle && !htmlSourceMode && bodyHasTable) {
        visualTableEditableRef.current?.focus();
        return;
      }
      getQuill()?.focus();
    },
  }), [getQuill, inHtmlEditor, onChange, onEditorState, enableHtmlSourceToggle, htmlSourceMode, bodyHasTable, emitFromVisualTableEditor]);

  useEffect(() => {
    const quill = getQuill();
    if (!quill) return;
    const handler = () => {
      const sel = quill.getSelection();
      const index = sel ? sel.index : quill.getLength();
      const plain = quill.getText();
      onEditorState?.(plain, index);
    };
    quill.on('selection-change', handler);
    quill.on('text-change', handler);
    return () => {
      quill.off('selection-change', handler);
      quill.off('text-change', handler);
    };
  }, [getQuill, onEditorState]);

  const handleChange = useCallback(
    (content) => {
      onChange?.(content);
      const quill = getQuill();
      if (quill) {
        const sel = quill.getSelection();
        const index = sel ? sel.index : quill.getLength();
        onEditorState?.(quill.getText(), index);
      }
    },
    [onChange, getQuill, onEditorState]
  );

  const insertVariable = useCallback(
    (key) => {
      if (!key) return;
      if (inHtmlEditor && htmlTextareaRef.current) {
        const ta = htmlTextareaRef.current;
        const insert = `{{${key}}}`;
        const start = typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length;
        const end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : start;
        const next = `${ta.value.slice(0, start)}${insert}${ta.value.slice(end)}`;
        onChange?.(next);
        requestAnimationFrame(() => {
          ta.focus();
          const pos = start + insert.length;
          ta.setSelectionRange(pos, pos);
        });
        return;
      }
      if (enableHtmlSourceToggle && !htmlSourceMode && bodyHasTable && visualTableEditableRef.current) {
        insertHtmlAtCaretInElement(visualTableEditableRef.current, `{{${key}}}`);
        emitFromVisualTableEditor();
        return;
      }
      const quill = getQuill();
      if (!quill) return;
      const insert = `{{${key}}}`;
      const sel = quill.getSelection(true);
      const index = sel ? sel.index : quill.getLength();
      quill.insertText(index, insert);
      quill.setSelection(index + insert.length);
      quill.focus();
    },
    [getQuill, inHtmlEditor, onChange, enableHtmlSourceToggle, htmlSourceMode, bodyHasTable, emitFromVisualTableEditor]
  );

  const computeMenuPos = useCallback(() => {
    const btn = varBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 8;
    const minWidth = 340;
    const desiredWidth = Math.min(520, Math.floor(window.innerWidth * 0.8));
    const width = Math.max(minWidth, desiredWidth);
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.min(Math.max(8, rect.left), maxLeft);
    const top = Math.min(rect.bottom + gap, window.innerHeight - 80);
    setVarMenuPos({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!varMenuOpen) return;
    computeMenuPos();
  }, [varMenuOpen, computeMenuPos]);

  const quillModules = useMemo(
    () => ({
      toolbar: { container: `#${toolbarId}` },
      clipboard: {
        // Prefer semantic structure over visual clipboard HTML (helps paragraphs / line breaks on paste).
        matchVisual: false,
      },
    }),
    [toolbarId]
  );

  useEffect(() => {
    let cancelled = false;
    const configureClipboard = () => {
      const quill = quillRef.current?.getEditor?.();
      if (cancelled || !quill?.clipboard || quill.__cnCallXTimeClipboard) return;
      if (!quill.root) {
        requestAnimationFrame(configureClipboard);
        return;
      }
      const Quill = getBundledQuill();
      if (!Quill?.import) return;
      quill.__cnCallXTimeClipboard = true;
      const Delta = Quill.import('delta');
      quill.clipboard.addMatcher(Node.TEXT_NODE, (node, delta) => {
        const text = node.data;
        if (typeof text !== 'string') return delta;
        if (!text.includes('\n') && !text.includes('\r')) return delta;
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const parts = normalized.split('\n');
        let d = new Delta();
        parts.forEach((line, i) => {
          if (i > 0) d = d.insert('\n');
          d = d.insert(line);
        });
        return d;
      });
    };
    configureClipboard();
    return () => {
      cancelled = true;
    };
  }, [toolbarId]);

  useEffect(() => {
    if (enableHtmlSourceToggle) return;
    if (htmlSourceMode) setHtmlSourceMode(false);
  }, [enableHtmlSourceToggle, htmlSourceMode]);

  useEffect(() => {
    if (!varMenuOpen) return;
    const onDocMouseDown = (e) => {
      const wrap = varMenuWrapRef.current;
      const btn = varBtnRef.current;
      const menu = varMenuRef.current;
      if (wrap && wrap.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      if (menu && menu.contains(e.target)) return;
      setVarMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setVarMenuOpen(false);
    };
    const onScroll = () => computeMenuPos();
    const onResize = () => computeMenuPos();
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [varMenuOpen, computeMenuPos]);

  return (
    <div
      className={`${styles.editorResizeWrap} ${compact ? styles.editorResizeWrapCompact : ''} ${scrollableLayout ? styles.editorResizeWrapScroll : ''
        } ${scrollableLayout && denseScrollLayout ? styles.editorResizeWrapScrollDense : ''}`.trim()}
    >
      <div className={styles.editorWrap}>
        <div id={toolbarId} className={`ql-toolbar ql-snow ${styles.toolbar} ${scrollableLayout && denseScrollLayout ? styles.toolbarDense : ''}`.trim()}>
          {enableHtmlSourceToggle ? (
            <span className={`ql-formats ${styles.htmlModeFormats}`}>
              <button
                type="button"
                className={`cn-html-mode-tab ${styles.htmlModeBtn} ${!htmlSourceMode ? styles.htmlModeBtnActive : ''}`}
                onClick={() => setHtmlSourceMode(false)}
                disabled={readOnly}
              >
                Visual
              </button>
              <button
                type="button"
                className={`cn-html-mode-tab ${styles.htmlModeBtn} ${htmlSourceMode ? styles.htmlModeBtnActive : ''}`}
                onClick={() => setHtmlSourceMode(true)}
                disabled={readOnly}
              >
                HTML
              </button>
            </span>
          ) : null}
          {!hideVariableMenu ? (
            <span className={`ql-formats ${styles.variableFormat}`} ref={varMenuWrapRef}>
              <button
                type="button"
                className={styles.variableBtn}
                onClick={() => setVarMenuOpen((v) => !v)}
                disabled={varsLoadingEffective || variableOptions.length === 0}
                aria-haspopup="menu"
                aria-expanded={varMenuOpen}
                ref={varBtnRef}
              >
                Variables ▾
              </button>
            </span>
          ) : null}
          <div
            className={styles.toolbarVisualRow}
            style={
              enableHtmlSourceToggle && (inHtmlEditor || visualIsRenderedPreview)
                ? { display: 'none' }
                : undefined
            }
          >
            <span className="ql-formats">
              <select className="ql-header" defaultValue="">
                <option value="">Normal</option>
                <option value="1">Heading 1</option>
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
              </select>
            </span>
            <span className="ql-formats">
              <button type="button" className="ql-bold" />
              <button type="button" className="ql-italic" />
              <button type="button" className="ql-underline" />
              <button type="button" className="ql-strike" />
            </span>
            <span className="ql-formats">
              <button type="button" className="ql-list" value="ordered" />
              <button type="button" className="ql-list" value="bullet" />
            </span>
            <span className="ql-formats">
              <button type="button" className="ql-link" />
              <button type="button" className="ql-image" />
            </span>
            <span className="ql-formats">
              <button type="button" className="ql-clean" />
            </span>
          </div>
        </div>
        {inHtmlEditor ? (
          <textarea
            ref={htmlTextareaRef}
            className={styles.htmlSourceTextarea}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            readOnly={readOnly}
            spellCheck={false}
            placeholder="Raw HTML for the email body. Merge fields use {{name}} syntax."
            aria-label="Email HTML source"
          />
        ) : visualIsRenderedPreview ? (
          <div className={styles.visualHtmlPreviewWrap}>
            <div className={styles.visualHtmlPreviewBanner}>
              Edit the email below (real HTML, including tables). Use{' '}
              <button
                type="button"
                className={styles.visualToHtmlBtn}
                onClick={() => setHtmlSourceMode(true)}
                disabled={readOnly}
              >
                HTML
              </button>{' '}
              for raw source.
            </div>
            <div
              ref={visualTableEditableRef}
              className={styles.visualHtmlPreviewBody}
              role="textbox"
              aria-multiline="true"
              aria-label="Email body visual editor"
              contentEditable={!readOnly}
              suppressContentEditableWarning
              onInput={emitFromVisualTableEditor}
              onBlur={emitFromVisualTableEditor}
              onClick={(e) => {
                const a = e.target instanceof Element ? e.target.closest('a') : null;
                if (a) e.preventDefault();
              }}
            />
          </div>
        ) : (
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={value}
            onChange={handleChange}
            modules={quillModules}
            placeholder={placeholder}
            className={styles.quillEditor}
            readOnly={readOnly}
          />
        )}
      </div>
      {!hideVariableMenu && varMenuOpen && varMenuPos
        ? createPortal(
          <div
            className={styles.variableMenu}
            role="menu"
            aria-label="Insert variable menu"
            style={{ top: varMenuPos.top, left: varMenuPos.left, width: varMenuPos.width }}
            ref={varMenuRef}
          >
            {variableOptions.map((group) => (
              <div key={group.moduleKey} className={styles.variableMenuGroup}>
                <div className={styles.variableMenuGroupTitle}>{group.label}</div>
                <div className={styles.variableMenuList}>
                  {group.list.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={styles.variableMenuItem}
                      role="menuitem"
                      onClick={() => {
                        insertVariable(v.key);
                        setVarMenuOpen(false);
                      }}
                      title={`Insert {{${v.key}}}`}
                    >
                      <span className={styles.variableMenuItemLabel}>{v.label}</span>
                      <code className={styles.variableMenuItemKey}>{v.key}</code>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )
        : null}
    </div>
  );
});
