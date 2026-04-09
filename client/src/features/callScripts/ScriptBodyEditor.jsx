import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useTemplateVariables } from '../../hooks/useTemplateVariables';
import styles from './ScriptBodyEditor.module.scss';

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link'],
  ['clean'],
];

export const ScriptBodyEditor = forwardRef(function ScriptBodyEditor(
  { value = '', onChange, onEditorState, placeholder },
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
  }, [grouped, moduleOrder, moduleLabels]);

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
    <div className={styles.editorResizeWrap}>
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
          <span className={`ql-formats ${styles.variableFormat}`} ref={varMenuWrapRef}>
            <button
              type="button"
              className={styles.variableBtn}
              onClick={() => setVarMenuOpen((v) => !v)}
              disabled={varsLoading || variableOptions.length === 0}
              aria-haspopup="menu"
              aria-expanded={varMenuOpen}
              ref={varBtnRef}
            >
              Variable ▾
            </button>
          </span>
          <span className="ql-formats">
            <button type="button" className="ql-clean" />
          </span>
        </div>
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value}
          onChange={handleChange}
          modules={{ toolbar: { container: `#${toolbarId}` } }}
          placeholder={placeholder}
          className={styles.quillEditor}
        />
      </div>
      {varMenuOpen && varMenuPos
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
