import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { SearchInput } from '../../../../components/ui/SearchInput';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../../../components/ui/Table';
import { Modal, ConfirmModal, ModalFooter } from '../../../../components/ui/Modal';
import { StatusBadge, Badge } from '../../../../components/ui/Badge';
import { IconButton } from '../../../../components/ui/IconButton';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Alert } from '../../../../components/ui/Alert';
import { useDialingSets, useDialingSetDispositions, useDispositions } from '../../hooks/useTenantData';
import { useTableLoadingState } from '../../../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../../../components/admin/TableDataRegion';
import { dialerPreferencesAPI } from '../../../../services/dialerPreferencesAPI';
import styles from '../../components/MasterCRUDPage.module.scss';

export function DialingSetsPage({ readOnly = false }) {
  const {
    dialingSets,
    loading,
    error,
    refetch,
    create,
    update,
    delete: deleteFn,
    setDefault,
  } = useDialingSets(true);

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const { dispositions: allDispositions } = useDispositions();

  const [selectedSet, setSelectedSet] = useState(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  const {
    dispositions: setDispositions,
    refetch: refetchDispositions,
    create: addDisposition,
    delete: removeDisposition,
    move: moveDisposition,
  } = useDialingSetDispositions(selectedSet?.id);

  const [showDispoModal, setShowDispoModal] = useState(false);
  const [selectedDispoId, setSelectedDispoId] = useState('');
  const [myDefaultSetId, setMyDefaultSetId] = useState(null);
  const [myDefaultSaving, setMyDefaultSaving] = useState(false);

  const loadMyDefault = useCallback(async () => {
    try {
      const res = await dialerPreferencesAPI.get();
      const id = res.data?.data?.default_dialing_set_id;
      setMyDefaultSetId(id != null && id !== '' ? String(id) : null);
    } catch {
      setMyDefaultSetId(null);
    }
  }, []);

  useEffect(() => {
    loadMyDefault();
  }, [loadMyDefault]);

  const handleSetMyDefault = async (e, item) => {
    e.stopPropagation();
    if (myDefaultSaving) return;
    setMyDefaultSaving(true);
    try {
      const nextId = String(myDefaultSetId ?? '') === String(item.id ?? '') ? null : item.id;
      await dialerPreferencesAPI.update({ default_dialing_set_id: nextId });
      setMyDefaultSetId(nextId != null ? String(nextId) : null);
    } catch {
      /* surface via toast if needed */
    } finally {
      setMyDefaultSaving(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!search) return dialingSets;
    const searchLower = search.toLowerCase();
    return dialingSets.filter((item) =>
      item.name.toLowerCase().includes(searchLower)
    );
  }, [dialingSets, search]);

  const availableDispositions = useMemo(() => {
    const usedIds = new Set(setDispositions.map(d => d.disposition_id));
    return allDispositions
      .filter(d => !usedIds.has(d.id) && d.is_active && !d.is_deleted)
      .map(d => ({ value: d.id, label: `${d.name} (${d.code})` }));
  }, [allDispositions, setDispositions]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({ name: '', description: '', is_default: 0 });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      is_default: item.is_default,
    });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!formData.name) errors.name = 'Name is required';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const result = editingItem
      ? await update.mutate(editingItem.id, formData)
      : await create.mutate(formData);

    if (result.success) {
      setShowModal(false);
      refetch();
    } else {
      setSubmitError(result.error);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    const result = await deleteFn.mutate(deleteItem.id);
    if (result.success) {
      setDeleteItem(null);
      if (selectedSet?.id === deleteItem.id) setSelectedSet(null);
      refetch();
    } else {
      setDeleteError(result.error || 'Delete failed');
    }
  };

  const handleSetDefault = async (id) => {
    await setDefault.mutate(id);
    refetch();
  };

  const handleAddDisposition = async () => {
    if (!selectedDispoId) return;
    const result = await addDisposition.mutate({
      dialing_set_id: selectedSet.id,
      disposition_id: selectedDispoId,
    });
    if (result.success) {
      setSelectedDispoId('');
      setShowDispoModal(false);
      refetchDispositions();
    }
  };

  const handleRemoveDisposition = async (id) => {
    await removeDisposition.mutate(id);
    refetchDispositions();
  };

  const handleMoveDisposition = async (id, direction) => {
    await moveDisposition.mutate(id, direction);
    refetchDispositions();
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dialing Sets"
        description={
          readOnly
            ? 'View dialing sets and how dispositions are ordered (read-only).'
            : 'Organize dispositions into sets for different calling campaigns'
        }
        actions={!readOnly ? <Button onClick={openCreateModal}>+ Create Dialing Set</Button> : undefined}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={styles.toolbar}>
        <SearchInput value={search} onSearch={(v) => setSearch(v)} placeholder="Search... (press Enter)" />
      </div>

      <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
      <div className={styles.splitView}>
        <div className={styles.listPanel}>
          <h3 className={styles.panelTitle}>Dialing Sets</h3>
          {filteredData.length === 0 ? (
            <EmptyState
              icon="📁"
              title="No dialing sets"
              description="Create your first dialing set."
              action={!readOnly ? openCreateModal : undefined}
              actionLabel="Create Set"
            />
          ) : (
            <div className={styles.list}>
              {filteredData.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.listItem} ${selectedSet?.id === item.id ? styles.selected : ''}`}
                  onClick={() => setSelectedSet(item)}
                >
                  <div className={styles.listItemContent}>
                    <span className={styles.listItemName}>{item.name}</span>
                    {item.is_default === 1 && <Badge variant="success">Team default</Badge>}
                    {String(myDefaultSetId ?? '') === String(item.id ?? '') && (
                      <Badge variant="primary">My default</Badge>
                    )}
                    {item.is_system_generated === 1 && <Badge variant="muted">System</Badge>}
                  </div>
                  <div className={styles.listItemActions}>
                    <IconButton
                      size="sm"
                      variant="subtle"
                      title={
                        String(myDefaultSetId ?? '') === String(item.id ?? '')
                          ? 'Clear as my personal default'
                          : 'Use as my personal default when dialing'
                      }
                      onClick={(e) => handleSetMyDefault(e, item)}
                      disabled={myDefaultSaving}
                    >
                      {String(myDefaultSetId ?? '') === String(item.id ?? '') ? '★' : '☆'}
                    </IconButton>
                    {!readOnly && (
                      <>
                        <IconButton
                          size="sm"
                          variant="subtle"
                          title={item.is_default === 1 ? 'Team default set' : 'Set as team default (admin)'}
                          onClick={(e) => { e.stopPropagation(); if (item.is_default !== 1) handleSetDefault(item.id); }}
                          disabled={item.is_default === 1}
                        >
                          {item.is_default === 1 ? '★' : '☆'}
                        </IconButton>
                        <IconButton size="sm" title="Edit" onClick={(e) => { e.stopPropagation(); openEditModal(item); }}>✏️</IconButton>
                        <IconButton size="sm" variant="danger" title={item.is_default === 1 ? 'Default set cannot be deleted' : 'Delete'} disabled={item.is_default === 1} onClick={(e) => { e.stopPropagation(); setDeleteItem(item); setDeleteError(null); }}>🗑️</IconButton>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.detailPanel}>
          {selectedSet ? (
            <>
              <div className={styles.detailHeader}>
                <h3>{selectedSet.name}</h3>
                {!readOnly && (
                  <Button size="sm" onClick={() => setShowDispoModal(true)}>+ Add Disposition</Button>
                )}
              </div>
              <div className={styles.detailContent}>
              {setDispositions.length === 0 ? (
                <EmptyState icon="📋" title="No dispositions" description="Add dispositions to this dialing set." />
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      {!readOnly && <TableHeaderCell width="60px">Order</TableHeaderCell>}
                      <TableHeaderCell>Disposition</TableHeaderCell>
                      <TableHeaderCell width="100px">Code</TableHeaderCell>
                      {!readOnly && <TableHeaderCell width="60px" align="center">Remove</TableHeaderCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {setDispositions.map((d, idx) => (
                      <TableRow key={d.id}>
                        {!readOnly && (
                          <TableCell>
                            <div className={styles.actions}>
                              <IconButton size="sm" onClick={() => handleMoveDisposition(d.id, 'up')} disabled={idx === 0}>↑</IconButton>
                              <IconButton size="sm" onClick={() => handleMoveDisposition(d.id, 'down')} disabled={idx === setDispositions.length - 1}>↓</IconButton>
                            </div>
                          </TableCell>
                        )}
                        <TableCell>{d.disposition_name}</TableCell>
                        <TableCell><code>{d.disposition_code}</code></TableCell>
                        {!readOnly && (
                          <TableCell align="center">
                            <IconButton size="sm" variant="danger" onClick={() => handleRemoveDisposition(d.id)}>✕</IconButton>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              </div>
            </>
          ) : (
            <EmptyState icon="👈" title="Select a dialing set" description="Click on a dialing set to manage its dispositions." />
          )}
        </div>
      </div>
      </TableDataRegion>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingItem ? 'Edit Dialing Set' : 'Create Dialing Set'} footer={
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSubmit} loading={create.loading || update.loading}>{editingItem ? 'Save' : 'Create'}</Button>
        </ModalFooter>
      }>
        <form onSubmit={handleSubmit} className={styles.form}>
          {submitError && <Alert variant="error">{submitError}</Alert>}
          <Input label="Name" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} error={formErrors.name} placeholder="e.g. Cold Calling Set" />
          <Input label="Description (optional)" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief description" />
        </form>
      </Modal>

      <Modal isOpen={showDispoModal} onClose={() => setShowDispoModal(false)} title="Add Disposition" size="sm" footer={
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDispoModal(false)}>Cancel</Button>
          <Button onClick={handleAddDisposition} loading={addDisposition.loading} disabled={!selectedDispoId}>Add</Button>
        </ModalFooter>
      }>
        <Select label="Select Disposition" value={selectedDispoId} onChange={(e) => setSelectedDispoId(e.target.value)} options={availableDispositions} placeholder="Choose a disposition..." />
      </Modal>

      <ConfirmModal isOpen={!!deleteItem} onClose={() => { setDeleteItem(null); setDeleteError(null); }} onConfirm={handleDelete} title="Delete Dialing Set" message={deleteError || `Delete "${deleteItem?.name}"? This will remove all disposition mappings.`} confirmText="Delete" loading={deleteFn.loading} />
    </div>
  );
}
