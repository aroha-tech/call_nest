import React, { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { EditIcon, ArchiveIcon, RefreshIcon, TrashIcon, RowActionGroup } from '../../components/ui/ActionIcons';
import { Input } from '../../components/ui/Input';
import { Checkbox } from '../../components/ui/Checkbox';
import { Badge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { Modal, ModalFooter, ConfirmModal } from '../../components/ui/Modal';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../../components/ui/Table';
import { contactTagsAPI } from '../../services/contactTagsAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import listStyles from '../../components/admin/adminDataList.module.scss';

export function ContactTagsPage() {
  const user = useAppSelector(selectUser);
  const role = user?.role ?? 'agent';
  const canManage = role === 'admin' || role === 'manager';

  const [showArchived, setShowArchived] = useState(false);
  const fetchList = useCallback(() => contactTagsAPI.list({ includeArchived: showArchived }), [showArchived]);
  const { data: tags, loading, error, refetch } = useAsyncData(fetchList, [fetchList], {
    transform: (res) => res.data?.data ?? [],
  });
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const createMut = useMutation((body) => contactTagsAPI.create(body));
  const updateMut = useMutation((id, body) => contactTagsAPI.update(id, body));
  const archiveMut = useMutation((id) => contactTagsAPI.softDelete(id));
  const unarchiveMut = useMutation((id) => contactTagsAPI.unarchive(id));
  const hardDeleteMut = useMutation((id) => contactTagsAPI.hardDeleteArchived(id));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmState, setConfirmState] = useState({ open: false, action: null, row: null });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setName(row.name || '');
    setFormError('');
    setModalOpen(true);
  };

  const canEditRow = (row) => {
    if (role === 'admin') return true;
    return Number(row.created_by) === Number(user?.id);
  };

  const handleSave = async () => {
    setFormError('');
    const n = String(name || '').trim();
    if (!n) {
      setFormError('Name is required');
      return;
    }
    let result;
    if (editing) {
      result = await updateMut.mutate(editing.id, { name: n });
    } else {
      result = await createMut.mutate({ name: n });
    }
    if (result?.success) {
      setModalOpen(false);
      refetch();
    } else {
      setFormError(result?.error || 'Save failed');
    }
  };

  const openActionConfirm = (action, row) => {
    setActionError('');
    setConfirmState({ open: true, action, row });
  };

  const closeActionConfirm = () => setConfirmState({ open: false, action: null, row: null });

  const handleArchive = async (row) => {
    if (!canEditRow(row)) return;
    const result = await archiveMut.mutate(row.id);
    if (result?.success) refetch();
    else setActionError(result?.error || 'Could not archive tag');
  };

  const handleHardDelete = async (row) => {
    if (!canEditRow(row)) return;
    const result = await hardDeleteMut.mutate(row.id);
    if (result?.success) refetch();
    else setActionError(result?.error || 'Could not permanently delete tag');
  };

  const handleUnarchive = async (row) => {
    if (!canEditRow(row)) return;
    const result = await unarchiveMut.mutate(row.id);
    if (result?.success) refetch();
    else setActionError(result?.error || 'Could not unarchive tag');
  };

  const handleConfirmAction = async () => {
    if (!confirmState.row) return;
    const row = confirmState.row;
    const action = confirmState.action;
    if (action === 'archive') {
      await handleArchive(row);
    } else if (action === 'unarchive') {
      await handleUnarchive(row);
    } else if (action === 'hardDelete') {
      await handleHardDelete(row);
    }
    closeActionConfirm();
  };

  if (!canManage) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Contact tags" />
        <Alert variant="error" display="inline">
          Only admin or manager can manage contact tags.
        </Alert>
      </div>
    );
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Contact tags"
        description="Shared org tags. Admin and tag-creating managers can archive; everyone can assign on leads and contacts."
        actions={<Button onClick={openCreate}>+ New tag</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}
      {actionError && <Alert variant="error">{actionError}</Alert>}

      <div className={listStyles.tableToolbarCheckboxOnly}>
        <Checkbox
          id="show-archived-contact-tags"
          label="Show archived"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
      </div>

      <div className={listStyles.tableCard}>
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {!tags?.length ? (
            <div className={listStyles.tableCardEmpty}>
              <p style={{ padding: 24, opacity: 0.85 }}>No tags yet. Create tags here, then select them on lead/contact forms.</p>
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
              <Table variant="adminList">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Created by</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell width="180px" align="center">
                      Actions
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tags.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.created_by_name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={t.deleted_at ? 'muted' : 'success'}>
                          {t.deleted_at ? 'Archived' : 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell align="center">
                        {canEditRow(t) ? (
                          <RowActionGroup>
                            {t.deleted_at ? (
                              <React.Fragment>
                                <IconButton
                                  size="sm"
                                  variant="success"
                                  title="Unarchive"
                                  onClick={() => openActionConfirm('unarchive', t)}
                                  disabled={hardDeleteMut.loading || archiveMut.loading || unarchiveMut.loading}
                                >
                                  <RefreshIcon />
                                </IconButton>
                                <IconButton
                                  size="sm"
                                  variant="danger"
                                  title="Delete permanently"
                                  onClick={() => openActionConfirm('hardDelete', t)}
                                  disabled={hardDeleteMut.loading || archiveMut.loading || unarchiveMut.loading}
                                >
                                  <TrashIcon />
                                </IconButton>
                              </React.Fragment>
                            ) : (
                              <React.Fragment>
                                <IconButton size="sm" title="Edit" onClick={() => openEdit(t)}>
                                  <EditIcon />
                                </IconButton>
                                <IconButton
                                  size="sm"
                                  variant="warning"
                                  title="Archive"
                                  onClick={() => openActionConfirm('archive', t)}
                                  disabled={archiveMut.loading || hardDeleteMut.loading || unarchiveMut.loading}
                                >
                                  <ArchiveIcon />
                                </IconButton>
                              </React.Fragment>
                            )}
                          </RowActionGroup>
                        ) : (
                          <span style={{ opacity: 0.6 }}>—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TableDataRegion>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit tag' : 'New tag'}
        footer={
          <ModalFooter>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createMut.loading || updateMut.loading}>
              Save
            </Button>
          </ModalFooter>
        }
      >
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP, March campaign" />
      </Modal>

      <ConfirmModal
        isOpen={confirmState.open}
        onClose={closeActionConfirm}
        onConfirm={handleConfirmAction}
        title={
          confirmState.action === 'hardDelete'
            ? 'Delete archived tag'
            : confirmState.action === 'unarchive'
            ? 'Unarchive tag'
            : 'Archive tag'
        }
        message={
          confirmState.action === 'hardDelete'
            ? `Delete archived tag "${confirmState.row?.name || ''}" permanently? This cannot be undone.`
            : confirmState.action === 'unarchive'
            ? `Unarchive tag "${confirmState.row?.name || ''}"? It will be available again in the pick list.`
            : `Archive tag "${confirmState.row?.name || ''}"? It will be removed from the pick list; assignments on contacts are cleared.`
        }
        confirmText={
          confirmState.action === 'hardDelete'
            ? 'Delete permanently'
            : confirmState.action === 'unarchive'
            ? 'Unarchive'
            : 'Archive'
        }
        variant={confirmState.action === 'hardDelete' ? 'danger' : 'primary'}
        loading={archiveMut.loading || hardDeleteMut.loading || unarchiveMut.loading}
      />
    </div>
  );
}
