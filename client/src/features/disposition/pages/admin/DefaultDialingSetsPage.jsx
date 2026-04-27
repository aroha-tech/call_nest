import React, { useState, useMemo, useCallback } from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { SearchInput } from '../../../../components/ui/SearchInput';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../../../components/ui/Table';
import { Modal, ConfirmModal, ModalFooter } from '../../../../components/ui/Modal';
import { StatusBadge, Badge } from '../../../../components/ui/Badge';
import { IconButton } from '../../../../components/ui/IconButton';
import { EditIcon, TrashIcon } from '../../../../components/ui/ActionIcons';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Alert } from '../../../../components/ui/Alert';
import { useDefaultDialingSets, useDefaultDialingSetDispositions, useDefaultDispositions } from '../../hooks/useDefaultData';
import { useIndustriesOptions } from '../../hooks/useMasterData';
import styles from '../../components/MasterCRUDPage.module.scss';
import { useTableLoadingState } from '../../../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../../../components/admin/TableDataRegion';

export function DefaultDialingSetsPage() {
  const [selectedIndustry, setSelectedIndustry] = useState('__all__');
  const [selectedSet, setSelectedSet] = useState(null);
  const { data: industries = [] } = useIndustriesOptions();
  
  // Handle "__all__" as null (All Industries)
  const industryIdParam = selectedIndustry === '__all__' ? null : (selectedIndustry || undefined);
  
  const {
    defaultDialingSets,
    loading,
    error,
    refetch,
    create,
    update,
    delete: deleteFn,
  } = useDefaultDialingSets(industryIdParam, true);

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const { defaultDispositions } = useDefaultDispositions(industryIdParam);
  
  const {
    dispositions: setDispositions,
    refetch: refetchDispositions,
    create: addDisposition,
    delete: removeDisposition,
    move: moveDisposition,
  } = useDefaultDialingSetDispositions(selectedSet?.id);

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDispoModal, setShowDispoModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [formData, setFormData] = useState({});
  const [selectedDispoId, setSelectedDispoId] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [draggingDispoId, setDraggingDispoId] = useState(null);

  const filteredData = useMemo(() => {
    if (!search) return defaultDialingSets;
    const searchLower = search.toLowerCase();
    return defaultDialingSets.filter((item) =>
      item.name.toLowerCase().includes(searchLower)
    );
  }, [defaultDialingSets, search]);

  const industryOptions = [
    { value: '__all__', label: '🌐 All Industries (Global)' },
    ...industries.map((i) => ({ value: i.id, label: i.name }))
  ];
  
  const availableDispositions = useMemo(() => {
    const usedIds = new Set(setDispositions.map(d => d.default_disposition_id));
    return defaultDispositions
      .filter(d => !usedIds.has(d.id) && d.is_active)
      .map(d => ({ value: d.id, label: d.name }));
  }, [defaultDispositions, setDispositions]);

  const openCreateModal = () => {
    if (!selectedIndustry) return;
    setEditingItem(null);
    setFormData({ 
      industry_id: selectedIndustry === '__all__' ? null : selectedIndustry, 
      name: '', 
      description: '', 
      is_default: 0 
    });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      industry_id: item.industry_id,
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

  const handleAddDisposition = async () => {
    if (!selectedDispoId) return;
    const result = await addDisposition.mutate({
      default_dialing_set_id: selectedSet.id,
      default_disposition_id: selectedDispoId,
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

  const handleDispoDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDispoDragStart = useCallback((e, id) => {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingDispoId(id);
  }, []);

  const handleDispoDragEnd = useCallback(() => {
    setDraggingDispoId(null);
  }, []);

  const handleDispoDrop = useCallback(
    async (e, targetId) => {
      e.preventDefault();
      setDraggingDispoId(null);
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || String(draggedId) === String(targetId)) return;
      const list = setDispositions;
      const from = list.findIndex((x) => String(x.id) === String(draggedId));
      const to = list.findIndex((x) => String(x.id) === String(targetId));
      if (from < 0 || to < 0) return;
      const targetPosition = list[to].order_index;
      await moveDisposition.mutate(draggedId, undefined, targetPosition);
      refetchDispositions();
    },
    [setDispositions, moveDisposition, refetchDispositions]
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Default Dialing Sets"
        titleIcon="tune"
        description="Groups of dispositions for specific calling scenarios"
        actions={
          <Button onClick={openCreateModal} disabled={!selectedIndustry}>
            Add dialing set
          </Button>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={styles.toolbar}>
        <Select
          value={selectedIndustry}
          onChange={(e) => { setSelectedIndustry(e.target.value); setSelectedSet(null); }}
          options={industryOptions}
          placeholder="Select Industry"
        />
        <SearchInput value={search} onSearch={(v) => setSearch(v)} placeholder="Search... (press Enter)" />
      </div>

      {!selectedIndustry ? (
        <EmptyState icon="🏭" title="Select an Industry" description="Choose an industry to manage its dialing sets." />
      ) : (
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
        <div className={styles.splitView}>
          <div className={styles.listPanel}>
            <h3 className={styles.panelTitle}>Dialing Sets</h3>
            {filteredData.length === 0 ? (
              <EmptyState icon="📁" title="No dialing sets" description="Create one to get started." action={openCreateModal} actionLabel="Add Set" />
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
                      {item.is_default === 1 && <Badge variant="primary">Default</Badge>}
                    </div>
                    <div className={styles.listItemActions}>
                      <IconButton size="sm" title="Edit" onClick={(e) => { e.stopPropagation(); openEditModal(item); }}>
                        <EditIcon />
                      </IconButton>
                      <IconButton size="sm" variant="danger" title={item.is_default === 1 ? 'Default set cannot be deleted' : 'Delete'} disabled={item.is_default === 1} onClick={(e) => { e.stopPropagation(); setDeleteItem(item); setDeleteError(null); }}>
                        <TrashIcon />
                      </IconButton>
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
                  <Button size="sm" onClick={() => setShowDispoModal(true)}>Add disposition</Button>
                </div>
                <div className={styles.detailContent}>
                {setDispositions.length === 0 ? (
                  <EmptyState icon="📋" title="No dispositions" description="Add dispositions to this dialing set." />
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell width="52px">Reorder</TableHeaderCell>
                        <TableHeaderCell>Disposition</TableHeaderCell>
                        <TableHeaderCell width="100px">Code</TableHeaderCell>
                        <TableHeaderCell width="60px" align="center">Remove</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {setDispositions.map((d) => (
                        <TableRow
                          key={d.id}
                          className={draggingDispoId === d.id ? styles.rowDragging : undefined}
                          onDragOver={handleDispoDragOver}
                          onDrop={(e) => handleDispoDrop(e, d.id)}
                        >
                          <TableCell>
                            <div
                              role="button"
                              tabIndex={0}
                              className={styles.dragHandle}
                              draggable={!moveDisposition.loading}
                              title="Drag to reorder"
                              aria-label={`Drag to reorder ${d.disposition_name || 'disposition'}`}
                              onDragStart={(e) => handleDispoDragStart(e, d.id)}
                              onDragEnd={handleDispoDragEnd}
                            >
                              <span className={styles.dragGrip} aria-hidden>
                                ⠿
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{d.disposition_name}</TableCell>
                          <TableCell align="center">
                            <IconButton size="sm" variant="danger" onClick={() => handleRemoveDisposition(d.id)}>✕</IconButton>
                          </TableCell>
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
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingItem ? 'Edit Dialing Set' : 'Create Dialing Set'} footer={
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSubmit} loading={create.loading || update.loading}>{editingItem ? 'Save' : 'Create'}</Button>
        </ModalFooter>
      }>
        <form onSubmit={handleSubmit} className={styles.form}>
          {submitError && <Alert variant="error">{submitError}</Alert>}
          <Input label="Name" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} error={formErrors.name} placeholder="e.g. Cold Calling Set" />
          <Input label="Description" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description" />
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

      <ConfirmModal isOpen={!!deleteItem} onClose={() => { setDeleteItem(null); setDeleteError(null); }} onConfirm={handleDelete} title="Delete Dialing Set" message={deleteError || `Delete "${deleteItem?.name}"? This will also remove all disposition mappings.`} confirmText="Delete" loading={deleteFn.loading} />
    </div>
  );
}
