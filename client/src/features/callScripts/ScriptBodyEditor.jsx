import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
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

  const getQuill = useCallback(() => {
    return quillRef.current?.getEditor?.() ?? null;
  }, []);

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

  return (
    <div className={styles.editorResizeWrap}>
      <div className={styles.editorWrap}>
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value}
          onChange={handleChange}
          modules={{ toolbar: TOOLBAR_OPTIONS }}
          placeholder={placeholder}
          className={styles.quillEditor}
        />
      </div>
    </div>
  );
});
