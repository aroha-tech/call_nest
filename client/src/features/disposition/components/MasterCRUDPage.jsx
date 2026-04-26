import React, { useState } from 'react';
import { TableDataRegion } from '../../../components/admin/TableDataRegion';
import { useTableLoadingState } from '../../../hooks/useTableLoadingState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../../components/ui/Table';
import { Modal, ConfirmModal, ModalFooter } from '../../../components/ui/Modal';
import { SlidePanel } from '../../../components/ui/SlidePanel';
import { IconButton } from '../../../components/ui/IconButton';
import { EditIcon, PauseIcon, PlayIcon, TrashIcon } from '../../../components/ui/ActionIcons';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Alert } from '../../../components/ui/Alert';
import { Pagination, PaginationPageSize } from '../../../components/ui/Pagination';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Badge } from '../../../components/ui/Badge';
import { Select } from '../../../components/ui/Select';
import styles from './MasterCRUDPage.module.scss';
import listStyles from '../../../components/admin/adminDataList.module.scss';

export function MasterCRUDPage({
  title,
  description,
  data,
  loading,
  error,
  columns,
  formFields,
  onCreate,
  onUpdate,
  onDelete,
  onToggleActive,
  refetch,
  pagination,
  onPageChange,
  onLimitChange,
  onSearch,
  search = '',
  showInactive,
  onShowInactiveChange,
  emptyIcon = '📋',
  emptyTitle = 'No items yet',
  emptyDescription = 'Create your first item to get started.',
  getItemLabel,
  /** 'auto' uses a left slide panel when the form has many fields; 'modal' | 'slidePanel' forces one surface. */
  formSurface = 'auto',
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [toggleItem, setToggleItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const handleSearch = (value) => {
    if (onSearch) {
      onSearch(value);
    }
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData(formFields.reduce((acc, f) => ({ ...acc, [f.name]: f.defaultValue ?? '' }), {}));
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData(formFields.reduce((acc, f) => ({ ...acc, [f.name]: item[f.name] ?? '' }), {}));
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    const errors = {};
    formFields.forEach((f) => {
      if (f.required && !formData[f.name] && !(editingItem && f.readOnlyOnEdit)) {
        errors[f.name] = `${f.label} is required`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const submitData = { ...formData };
    if (editingItem) {
      formFields.forEach((f) => {
        if (f.readOnlyOnEdit) {
          delete submitData[f.name];
        }
      });
    }

    const result = editingItem
      ? await onUpdate.mutate(editingItem.id, submitData)
      : await onCreate.mutate(formData);

    if (result.success) {
      setShowModal(false);
      refetch();
    } else {
      setSubmitError(result.error);
    }
  };

  const handleDelete = async () => {
    const result = await onDelete.mutate(deleteItem.id);
    if (result.success) {
      setDeleteItem(null);
      refetch();
    }
  };

  const handleToggleActive = async () => {
    if (!onToggleActive) return;
    setToggleLoading(true);
    const result = await onToggleActive.mutate(toggleItem.id);
    setToggleLoading(false);
    if (result.success) {
      setToggleItem(null);
      refetch();
    }
  };

  const showStatusColumn = columns.some((col) => col.key === 'is_active');
  const isActiveValue = (val) => val === 1 || val === true;
  const columnsWithStatus = showStatusColumn
    ? columns
    : [
        ...columns,
        {
          key: 'is_active',
          label: 'Status',
          width: '108px',
          noTruncate: true,
          render: (val) => (
            <Badge variant={isActiveValue(val) ? 'success' : 'warning'} size="md">
              {isActiveValue(val) ? 'Active' : 'Inactive'}
            </Badge>
          ),
        },
      ];

  /** Table uses auto layout + content width — do not inject % widths (they fight horizontal scroll on narrow screens). */
  const columnsForTable = columnsWithStatus;

  const useSlidePanel =
    formSurface === 'slidePanel' ||
    (formSurface === 'auto' && formFields.length >= 6);
  const FormSurface = useSlidePanel ? SlidePanel : Modal;

  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        description={description}
        actions={<Button onClick={openCreateModal}>+ Add New</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={listStyles.tableCardToolbarLeft}>
            {pagination && (
              <PaginationPageSize
                limit={pagination.limit}
                onLimitChange={onLimitChange}
              />
            )}
            {onShowInactiveChange && (
              <Checkbox
                label="Show inactive"
                checked={!!showInactive}
                onChange={(e) => onShowInactiveChange(e.target.checked)}
              />
            )}
          </div>
          <SearchInput
            value={search}
            onSearch={handleSearch}
            placeholder="Search... (press Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {data.length === 0 ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon={emptyIcon}
                title={search ? 'No results found' : emptyTitle}
                description={search ? 'Try a different search term.' : emptyDescription}
                action={!search ? openCreateModal : undefined}
                actionLabel={!search ? 'Add New' : undefined}
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
            <Table variant="adminList">
              <TableHead>
                <TableRow>
                  {columnsForTable.map((col) => (
                    <TableHeaderCell key={col.key} width={col.width} noTruncate={!!col.noTruncate}>
                      {col.label}
                    </TableHeaderCell>
                  ))}
                  <TableHeaderCell width="140px" align="center">Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((item) => (
                  <TableRow key={item.id}>
                    {columnsForTable.map((col) => (
                      <TableCell key={col.key} width={col.width} noTruncate={!!col.noTruncate}>
                        {col.render ? col.render(item[col.key], item) : item[col.key]}
                      </TableCell>
                    ))}
                    <TableCell align="center">
                      <div className={styles.actions}>
                        <IconButton title="Edit" onClick={() => openEditModal(item)}>
                          <EditIcon />
                        </IconButton>
                        {onToggleActive && (
                          <IconButton
                            title={item.is_active === 1 ? 'Deactivate' : 'Activate'}
                            variant={item.is_active === 1 ? 'warning' : 'success'}
                            onClick={() => setToggleItem(item)}
                          >
                            {item.is_active === 1 ? <PauseIcon /> : <PlayIcon />}
                          </IconButton>
                        )}
                        <IconButton title="Delete" variant="danger" onClick={() => setDeleteItem(item)}>
                          <TrashIcon />
                        </IconButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
              onPageChange={onPageChange}
              onLimitChange={onLimitChange}
              hidePageSize
            />
          </div>
        )}
      </div>

      <FormSurface
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'Edit Item' : 'Create New Item'}
        size={useSlidePanel ? 'xl' : 'md'}
        {...(useSlidePanel ? { closeOnOverlay: true, closeOnEscape: true } : {})}
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={onCreate.loading || onUpdate.loading}
            >
              {editingItem ? 'Save Changes' : 'Create'}
            </Button>
          </ModalFooter>
        }
      >
        <form onSubmit={handleSubmit} className={styles.form}>
          {submitError && <Alert variant="error">{submitError}</Alert>}
          {formFields.map((field) => {
            const isDisabled = field.disabled || (editingItem && field.readOnlyOnEdit);
            if (field.type === 'select' && field.options) {
              return (
                <Select
                  key={field.name}
                  label={field.label}
                  value={formData[field.name] || ''}
                  onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  options={field.options}
                  placeholder={field.placeholder || 'Select...'}
                  disabled={isDisabled}
                  error={formErrors[field.name]}
                />
              );
            }
            return (
              <Input
                key={field.name}
                label={field.label}
                value={formData[field.name] || ''}
                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                error={formErrors[field.name]}
                placeholder={field.placeholder}
                disabled={isDisabled}
                hint={isDisabled && editingItem && field.readOnlyOnEdit ? 'Code cannot be changed after creation' : field.hint}
              />
            );
          })}
        </form>
      </FormSurface>

      {/* Toggle Active/Inactive Confirmation */}
      <ConfirmModal
        isOpen={!!toggleItem}
        onClose={() => setToggleItem(null)}
        onConfirm={handleToggleActive}
        title={toggleItem?.is_active === 1 ? 'Deactivate Item' : 'Activate Item'}
        message={
          toggleItem?.is_active === 1
            ? `Are you sure you want to deactivate "${getItemLabel ? getItemLabel(toggleItem) : (toggleItem?.name || toggleItem?.code)}"? It will be hidden from active lists.`
            : `Are you sure you want to activate "${getItemLabel ? getItemLabel(toggleItem) : (toggleItem?.name || toggleItem?.code)}"? It will be visible in active lists.`
        }
        confirmText={toggleItem?.is_active === 1 ? 'Deactivate' : 'Activate'}
        loading={toggleLoading}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        title="Delete Item"
        message={`Are you sure you want to permanently delete "${getItemLabel ? getItemLabel(deleteItem) : (deleteItem?.name || deleteItem?.code)}"? This action cannot be undone.`}
        confirmText="Delete"
        loading={onDelete.loading}
      />
    </div>
  );
}
