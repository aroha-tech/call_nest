import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Checkbox } from '../../components/ui/Checkbox';
import { SearchInput } from '../../components/ui/SearchInput';
import { Modal, ConfirmModal, ModalFooter } from '../../components/ui/Modal';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { IconButton } from '../../components/ui/IconButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import { Pagination, PaginationPageSize } from '../../components/ui/Pagination';
import { VariableSelector } from '../../components/VariableSelector';
import { callScriptsAPI } from '../../services/dispositionAPI';
import { useMutation } from '../../hooks/useAsyncData';
import { useTemplateVariableAutocomplete } from '../../hooks/useTemplateVariables';
import { renderPreview, linkify, linkifyHtml, stripHtml, DEFAULT_PREVIEW_DATA } from '../../utils/templateVariables';
import { templateVariablesAPI } from '../../services/templateVariablesAPI';
import { ScriptBodyEditor } from './ScriptBodyEditor';
import styles from './CallScriptsPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { usePermissions } from '../../hooks/usePermission';
import { PERMISSIONS } from '../../utils/permissionUtils';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { dialerPreferencesAPI } from '../../services/dialerPreferencesAPI';

const defaultPagination = { page: 1, limit: 10, total: 0, totalPages: 1 };

export function CallScriptsPage() {
  const { can } = usePermissions();
  const user = useAppSelector(selectUser);
  const canManageAll = can(PERMISSIONS.SETTINGS_MANAGE);
  const canSelf = can(PERMISSIONS.SCRIPTS_SELF);
  const canAddScript = canManageAll || canSelf;

  const canEditScript = (script) => {
    if (canManageAll) return true;
    if (!canSelf || !script) return false;
    if (script.created_by == null) return false;
    return Number(script.created_by) === Number(user?.id);
  };

  const [scripts, setScripts] = useState([]);
  const [pagination, setPagination] = useState(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [previewSampleData, setPreviewSampleData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [scriptName, setScriptName] = useState('');
  const [scriptBody, setScriptBody] = useState('');
  const [editorPlainText, setEditorPlainText] = useState('');
  const [editorCursorIndex, setEditorCursorIndex] = useState(0);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [myDefaultScriptId, setMyDefaultScriptId] = useState(null);
  const [myDefaultSaving, setMyDefaultSaving] = useState(false);
  const [viewScript, setViewScript] = useState(null);
  const editorRef = useRef(null);

  const fetchScripts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await callScriptsAPI.getAll({
        search,
        includeInactive: showInactive,
        page,
        limit,
      });
      setScripts(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? defaultPagination);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load scripts');
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, [search, showInactive, page, limit]);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  const loadMyDefault = useCallback(async () => {
    try {
      const res = await dialerPreferencesAPI.get();
      const id = res.data?.data?.default_call_script_id;
      setMyDefaultScriptId(id != null ? Number(id) : null);
    } catch {
      setMyDefaultScriptId(null);
    }
  }, []);

  useEffect(() => {
    loadMyDefault();
  }, [loadMyDefault]);

  const handleSetMyDefault = async (script) => {
    if (myDefaultSaving) return;
    setMyDefaultSaving(true);
    try {
      const nextId = Number(myDefaultScriptId) === Number(script.id) ? null : script.id;
      await dialerPreferencesAPI.update({ default_call_script_id: nextId });
      setMyDefaultScriptId(nextId != null ? Number(nextId) : null);
    } finally {
      setMyDefaultSaving(false);
    }
  };

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const handleSearch = useCallback((v) => {
    setSearch(v);
    setPage(1);
  }, []);
  const handlePageChange = useCallback((newPage) => setPage(newPage), []);
  const handleLimitChange = useCallback((newLimit) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

  useEffect(() => {
    let mounted = true;
    templateVariablesAPI.getPreviewSample()
      .then((res) => {
        if (mounted && res.data) {
          setPreviewSampleData({ ...DEFAULT_PREVIEW_DATA, ...res.data });
        }
      })
      .catch(() => {
        if (mounted) setPreviewSampleData(DEFAULT_PREVIEW_DATA);
      });
    return () => { mounted = false; };
  }, []);

  const createMutation = useMutation(callScriptsAPI.create);
  const updateMutation = useMutation((id, data) => callScriptsAPI.update(id, data));
  const deleteMutation = useMutation(callScriptsAPI.delete);

  const handleToggleStatusConfirm = useCallback(async () => {
    if (!toggleTarget) return;
    setToggleLoading(true);
    const newStatus = toggleTarget.status === 1 ? 0 : 1;
    const result = await updateMutation.mutate(toggleTarget.id, { status: newStatus });
    setToggleLoading(false);
    if (result?.success !== false) {
      setToggleTarget(null);
      fetchScripts();
    }
  }, [toggleTarget, updateMutation, fetchScripts]);

  const { active: autocompleteActive, suggestions, context: autocompleteContext } = useTemplateVariableAutocomplete(
    editorPlainText,
    editorCursorIndex
  );

  const openCreate = () => {
    setEditingId(null);
    setScriptName('');
    setScriptBody('');
    setEditorPlainText('');
    setEditorCursorIndex(0);
    setShowPreviewModal(false);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (script) => {
    setEditingId(script.id);
    setScriptName(script.script_name);
    setScriptBody(script.script_body || '');
    setEditorPlainText(stripHtml(script.script_body || ''));
    setEditorCursorIndex(0);
    setShowPreviewModal(false);
    setFormError(null);
    setShowModal(true);
  };

  const handleInsertVariable = useCallback((text) => {
    editorRef.current?.insertAtCursor(text);
    editorRef.current?.focus();
  }, []);

  const handleAutocompleteSelect = (key) => {
    if (!autocompleteContext) return;
    const insert = `{{${key}}}`;
    editorRef.current?.replaceRange(autocompleteContext.startIndex, editorCursorIndex, insert);
    editorRef.current?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!scriptName.trim()) {
      setFormError('Script name is required');
      return;
    }
    const bodyTrimmed = scriptBody.replace(/<[^>]*>/g, '').trim();
    if (!bodyTrimmed || bodyTrimmed === '') {
      setFormError('Script body is required');
      return;
    }

    const payload = { script_name: scriptName.trim(), script_body: scriptBody };
    const result = editingId
      ? await updateMutation.mutate(editingId, payload)
      : await createMutation.mutate(payload);

    if (result?.success) {
      setShowModal(false);
      fetchScripts();
    } else {
      setFormError(result?.error || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMutation.mutate(deleteTarget.id);
    if (result?.success) {
      setDeleteTarget(null);
      fetchScripts();
    }
  };

  const previewSample = previewSampleData || DEFAULT_PREVIEW_DATA;
  const previewRendered = renderPreview(scriptBody, previewSample);
  const isHtml = /<[a-z][\s\S]*>/i.test(scriptBody);
  const previewHtml = isHtml ? linkifyHtml(previewRendered) : linkify(previewRendered);
  const previewText = previewRendered;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Call Scripts"
        description={
          canManageAll
            ? 'Create scripts with variables like {{contact_first_name}} for use in the dialer.'
            : 'View team scripts. You can add scripts and edit only scripts you created.'
        }
        actions={canAddScript ? <Button onClick={openCreate}>+ Add Script</Button> : undefined}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={listStyles.tableCardToolbarLeft}>
            <PaginationPageSize limit={pagination.limit} onLimitChange={handleLimitChange} />
            <Checkbox
              label="Show inactive"
              checked={showInactive}
              onChange={(e) => {
                setShowInactive(e.target.checked);
                setPage(1);
              }}
            />
          </div>
          <SearchInput
            value={search}
            onSearch={handleSearch}
            placeholder="Search by script name... (press Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {scripts.length === 0 ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📜"
                title={search || showInactive ? 'No results found' : 'No call scripts yet'}
                description={search || showInactive ? 'Try a different search or clear filters.' : 'Add a script to guide agents during calls. Use variables for dynamic content.'}
                action={canAddScript && !search && !showInactive ? openCreate : undefined}
                actionLabel="Add Script"
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Script Name</TableHeaderCell>
                  <TableHeaderCell>Variables</TableHeaderCell>
                  <TableHeaderCell width="96px">Team default</TableHeaderCell>
                  <TableHeaderCell width="88px" align="center">My default</TableHeaderCell>
                  <TableHeaderCell width="100px">Status</TableHeaderCell>
                  <TableHeaderCell width="200px" align="center">Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scripts.map((script) => {
                  const editable = canEditScript(script);
                  return (
                  <TableRow key={script.id}>
                    <TableCell>{script.script_name}</TableCell>
                    <TableCell>
                      {Array.isArray(script.variables_used) && script.variables_used.length > 0
                        ? script.variables_used.join(', ')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {script.is_default === 1 ? (
                        <Badge variant="primary" size="sm">Yes</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        variant="subtle"
                        title={
                          Number(myDefaultScriptId) === Number(script.id)
                            ? 'Clear as my personal default'
                            : 'Use as my personal default when calling'
                        }
                        onClick={() => handleSetMyDefault(script)}
                        disabled={myDefaultSaving}
                      >
                        {Number(myDefaultScriptId) === Number(script.id) ? '★' : '☆'}
                      </IconButton>
                    </TableCell>
                    <TableCell><StatusBadge isActive={script.status === 1} /></TableCell>
                    <TableCell align="center">
                      <div className={styles.actions}>
                        <IconButton title="View script" onClick={() => setViewScript(script)}>
                          👁️
                        </IconButton>
                        <IconButton
                          title={editable ? 'Edit' : 'You can only edit scripts you created'}
                          onClick={() => openEdit(script)}
                          disabled={!editable}
                        >
                          ✏️
                        </IconButton>
                        <IconButton
                          title={
                            !editable
                              ? 'You can only change status on scripts you created'
                              : script.status === 1
                                ? 'Deactivate'
                                : 'Activate'
                          }
                          variant={script.status === 1 ? 'warning' : 'success'}
                          onClick={() => setToggleTarget(script)}
                          disabled={!editable || toggleLoading}
                        >
                          {script.status === 1 ? '⏸️' : '▶️'}
                        </IconButton>
                        <IconButton
                          title={
                            script.is_default === 1
                              ? 'Team default script cannot be deleted'
                              : !editable
                                ? 'You can only delete scripts you created'
                                : 'Delete'
                          }
                          variant="danger"
                          onClick={() => setDeleteTarget(script)}
                          disabled={!editable || script.is_default === 1}
                        >
                          🗑️
                        </IconButton>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </TableDataRegion>
        {pagination && (
          <div className={listStyles.tableCardFooterPagination}>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              hidePageSize
            />
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Script' : 'Add Script'}
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.loading || updateMutation.loading}>
              {editingId ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        }
      >
        <form onSubmit={handleSubmit} className={styles.form}>
          {formError && <Alert variant="error">{formError}</Alert>}

          <Input
            label="Script Name"
            value={scriptName}
            onChange={(e) => setScriptName(e.target.value)}
            placeholder="e.g. Welcome Call"
            required
          />

          <div className={styles.bodyRow}>
            <div className={styles.bodyCol}>
              <label className={styles.label}>Script Body</label>
              <ScriptBodyEditor
                ref={editorRef}
                value={scriptBody}
                onChange={setScriptBody}
                onEditorState={(plain, index) => {
                  setEditorPlainText(plain);
                  setEditorCursorIndex(index ?? 0);
                }}
                placeholder="Hello {{contact_first_name | Customer}}, my name is {{agent_name}} from {{company_name}}..."
              />
              {autocompleteActive && suggestions.length > 0 && (
                <div className={styles.autocomplete}>
                  {suggestions.slice(0, 8).map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={styles.autocompleteItem}
                      onClick={() => handleAutocompleteSelect(v.key)}
                    >
                      {v.label} <code>{v.key}</code>
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.previewRow}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowPreviewModal(true)}>
                  Show Preview
                </Button>
              </div>
            </div>
            <div className={styles.varCol}>
              <div className={styles.varColInner}>
                <VariableSelector onInsert={handleInsertVariable} className={styles.varSelectorFill} />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="Script Preview"
        size="md"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowPreviewModal(false)}>Close</Button>
          </ModalFooter>
        }
      >
        <p className={styles.previewModalHint}>Sample data: contact_first_name, agent_name, company_name, links, etc.</p>
        <div
          className={styles.previewModalContent}
          dangerouslySetInnerHTML={{
            __html: previewText ? previewHtml : '<span class="preview-empty">(empty)</span>',
          }}
        />
      </Modal>

      <Modal
        isOpen={!!viewScript}
        onClose={() => setViewScript(null)}
        title={viewScript ? `View: ${viewScript.script_name}` : 'View script'}
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setViewScript(null)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        {viewScript && (
          <div
            className={styles.previewModalContent}
            dangerouslySetInnerHTML={{
              __html: (() => {
                const sample = previewSampleData || DEFAULT_PREVIEW_DATA;
                const rendered = renderPreview(viewScript.script_body || '', sample);
                const isHtml = /<[a-z][\s\S]*>/i.test(viewScript.script_body || '');
                return isHtml ? linkifyHtml(rendered) : linkify(rendered);
              })(),
            }}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleStatusConfirm}
        title={toggleTarget?.status === 1 ? 'Deactivate Script' : 'Activate Script'}
        message={
          toggleTarget
            ? toggleTarget.status === 1
              ? `Are you sure you want to deactivate "${toggleTarget.script_name}"? It will be hidden from active lists.`
              : `Are you sure you want to activate "${toggleTarget.script_name}"? It will be visible in active lists.`
            : ''
        }
        confirmText={toggleTarget?.status === 1 ? 'Deactivate' : 'Activate'}
        loading={toggleLoading}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Script"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.script_name}"?` : ''}
        confirmText="Delete"
        loading={deleteMutation.loading}
      />
    </div>
  );
}
