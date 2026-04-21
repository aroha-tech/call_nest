import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useTemplateVariables } from '../../hooks/useTemplateVariables';
import styles from './ScriptBodyEditor.module.scss';

const getBundledQuill = () => ReactQuill.Quill;

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
  },
  ref
) {
  const quillRef = useRef(null);
  const toolbarId = useMemo(() => `quill-toolbar-${Math.random().toString(36).slice(2)}`, []);
  const { grouped, moduleOrder, moduleLabels, loading: varsLoading } = useTemplateVariables();
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

  useImperativeHandle(ref, () => ({
    insertAtCursor(text) {
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
      getQuill()?.focus();
    },
  }), [getQuill]);

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
      const quill = getQuill();
      if (!quill) return;
      const insert = `{{${key}}}`;
      const sel = quill.getSelection(true);
      const index = sel ? sel.index : quill.getLength();
      quill.insertText(index, insert);
      quill.setSelection(index + insert.length);
      quill.focus();
    },
    [getQuill]
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
      if (cancelled || !quill?.clipboard || quill.__cnCallNestClipboard) return;
      if (!quill.root) {
        requestAnimationFrame(configureClipboard);
        return;
      }
      const Quill = getBundledQuill();
      if (!Quill?.import) return;
      quill.__cnCallNestClipboard = true;
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
      className={`${styles.editorResizeWrap} ${compact ? styles.editorResizeWrapCompact : ''} ${
        scrollableLayout ? styles.editorResizeWrapScroll : ''
      }`}
    >
      <div className={styles.editorWrap}>
        <div id={toolbarId} className={`ql-toolbar ql-snow ${styles.toolbar}`}>
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
          </span>
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
                Variable ▾
              </button>
            </span>
          ) : null}
          <span className="ql-formats">
            <button type="button" className="ql-clean" />
          </span>
        </div>
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
