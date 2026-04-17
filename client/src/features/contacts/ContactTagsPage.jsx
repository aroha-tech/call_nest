import React, { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { EditIcon, ArchiveIcon, RowActionGroup } from '../../components/ui/ActionIcons';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Modal, ModalFooter } from '../../components/ui/Modal';
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

  const fetchList = useCallback(() => contactTagsAPI.list(), []);
  const { data: tags, loading, error, refetch } = useAsyncData(fetchList, [fetchList], {
    transform: (res) => res.data?.data ?? [],
  });
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const createMut = useMutation((body) => contactTagsAPI.create(body));
  const updateMut = useMutation((id, body) => contactTagsAPI.update(id, body));
  const deleteMut = useMutation((id) => contactTagsAPI.softDelete(id));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');

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

  const handleArchive = async (row) => {
    if (!canEditRow(row)) return;
    const ok = window.confirm(`Archive tag "${row.name}"? It will be removed from the pick list; assignments on contacts are cleared.`);
    if (!ok) return;
    const result = await deleteMut.mutate(row.id);
    if (result?.success) refetch();
    else window.alert(result?.error || 'Could not archive tag');
  };

  if (!canManage) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Contact tags" />
        <Alert variant="error">Only admin or manager can manage contact tags.</Alert>
      </div>
    );
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Contact tags"
        description="Tags are shared for the whole organization. Admin can archive any tag; managers can archive tags they created. Everyone assigns any tag on leads and contacts."
        actions={<Button onClick={openCreate}>+ New tag</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}

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
                      <TableCell align="center">
                        {canEditRow(t) ? (
                          <RowActionGroup>
                            <IconButton size="sm" title="Edit" onClick={() => openEdit(t)}>
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              size="sm"
                              variant="warning"
                              title="Archive"
                              onClick={() => handleArchive(t)}
                              disabled={deleteMut.loading}
                            >
                              <ArchiveIcon />
                            </IconButton>
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
    </div>
  );
}
