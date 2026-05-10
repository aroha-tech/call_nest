import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Pagination, PaginationPageSize } from '../ui/Pagination';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../ui/Table';
import { TableDataRegion } from '../admin/TableDataRegion';
import listStyles from '../admin/adminDataList.module.scss';
import { contactsAPI } from '../../services/contactsAPI';

/**
 * Same pattern as Meetings — searchable table to pick a contact or lead by id.
 * @param {'contact'|'lead'} pickerType
 */
export function ContactLeadPickerModal({ isOpen, onClose, pickerType, onPick }) {
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerLimit, setPickerLimit] = useState(10);
  const [pickerRows, setPickerRows] = useState([]);
  const [pickerPagination, setPickerPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [pickerLoading, setPickerLoading] = useState(false);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const res = await contactsAPI.getAll({
          search: pickerSearch || undefined,
          type: pickerType,
          page: pickerPage,
          limit: pickerLimit,
        });
        if (cancelled) return;
        setPickerRows(res?.data?.data ?? []);
        setPickerPagination(
          res?.data?.pagination ?? { total: 0, page: pickerPage, limit: pickerLimit, totalPages: 1 }
        );
      } catch {
        if (cancelled) return;
        setPickerRows([]);
        setPickerPagination({ total: 0, page: pickerPage, limit: pickerLimit, totalPages: 1 });
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, pickerType, pickerSearch, pickerPage, pickerLimit]);

  useEffect(() => {
    if (isOpen) {
      setPickerSearch('');
      setPickerPage(1);
    }
  }, [isOpen, pickerType]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={pickerType === 'lead' ? 'Select lead' : 'Select contact'}
      size="lg"
      footer={
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </ModalFooter>
      }
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <Input
            label="Search"
            value={pickerSearch}
            onChange={(e) => {
              setPickerSearch(e.target.value);
              setPickerPage(1);
            }}
            placeholder={pickerType === 'lead' ? 'Search leads…' : 'Search contacts…'}
          />
        </div>
        <PaginationPageSize
          limit={pickerLimit}
          onLimitChange={(n) => {
            setPickerLimit(n);
            setPickerPage(1);
          }}
        />
      </div>

      <TableDataRegion loading={pickerLoading} hasCompletedInitialFetch skeletonColumns={3}>
        {pickerRows.length === 0 && !pickerLoading ? (
          <div className={listStyles.tableCardEmpty}>No results.</div>
        ) : (
          <div className={listStyles.tableCardBody} style={{ padding: 0 }}>
            <Table variant="adminList" flexibleLastColumn>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell width="180px">Phone</TableHeaderCell>
                  <TableHeaderCell width="260px">Email</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pickerRows.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => {
                      onPick?.(c);
                      handleClose();
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Click to select"
                  >
                    <TableCell noTruncate>
                      {c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell noTruncate>{c.primary_phone || '—'}</TableCell>
                    <TableCell noTruncate>{c.email || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TableDataRegion>
      <div className={listStyles.tableCardFooterPagination}>
        <Pagination
          page={pickerPagination.page ?? pickerPage}
          totalPages={Math.max(1, pickerPagination.totalPages || 1)}
          total={pickerPagination.total ?? 0}
          limit={pickerPagination.limit ?? pickerLimit}
          onPageChange={setPickerPage}
          hidePageSize
        />
      </div>
    </Modal>
  );
}
