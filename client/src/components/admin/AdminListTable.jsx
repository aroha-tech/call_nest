import React from 'react';
import { FilterBar } from './FilterBar';
import { TableDataRegion } from './TableDataRegion';
import { SearchInput } from '../ui/SearchInput';
import { Pagination, PaginationPageSize } from '../ui/Pagination';
import { EmptyState } from '../ui/EmptyState';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import listStyles from './adminDataList.module.scss';

/**
 * Standard admin list table: optional FilterBar -> card toolbar (page size + search) ->
 * scrollable table body -> footer pagination (page size only in toolbar).
 */
export function AdminListTable({
  filters,
  onFilterApply,
  onFilterReset,
  filterBarFluid = false,
  toolbarLeft,
  search,
  onSearch,
  searchPlaceholder = 'Search... (press Enter)',
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 20,
  onPageChange,
  onLimitChange,
  loading = false,
  isEmpty = false,
  emptyIcon = '\u{1F4CB}',
  emptyTitle = 'No results',
  emptyDescription = 'Try adjusting search or filters.',
  skeletonColumns = 6,
  children,
  className = '',
}) {
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const filterSection =
    filters && (onFilterApply || onFilterReset) ? (
      <FilterBar onApply={onFilterApply} onReset={onFilterReset} fluid={filterBarFluid}>
        {filters}
      </FilterBar>
    ) : filters ? (
      filters
    ) : null;

  return (
    <div className={className || undefined}>
      {filterSection}
      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={listStyles.tableCardToolbarLeft}>
            {onLimitChange ? (
              <PaginationPageSize limit={limit} onLimitChange={onLimitChange} />
            ) : null}
            {toolbarLeft}
          </div>
          {onSearch ? (
            <SearchInput
              value={search ?? ''}
              onSearch={onSearch}
              placeholder={searchPlaceholder}
              className={listStyles.searchInToolbar}
            />
          ) : null}
        </div>
        <TableDataRegion
          loading={loading}
          hasCompletedInitialFetch={hasCompletedInitialFetch}
          skeletonColumns={skeletonColumns}
        >
          {isEmpty ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>{children}</div>
          )}
        </TableDataRegion>
        {onPageChange ? (
          <div className={listStyles.tableCardFooterPagination}>
            <Pagination
              page={page}
              totalPages={Math.max(1, totalPages)}
              total={total}
              limit={limit}
              onPageChange={onPageChange}
              onLimitChange={onLimitChange}
              hidePageSize
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
