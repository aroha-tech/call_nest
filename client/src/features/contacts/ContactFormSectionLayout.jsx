import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  splitOrderSegments,
  pairBlockToColumns,
} from './contactFormSectionSegments';
import styles from './ContactFormPage.module.scss';

function useTwoColumnLayout() {
  const [ok, setOk] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 900px)').matches : true
  );
  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const fn = () => setOk(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return ok;
}

function sectionCardStyle(fullWidth, sortableStyle) {
  const base = {
    width: fullWidth ? '100%' : undefined,
  };
  if (!sortableStyle) return base;
  const t = sortableStyle.transform;
  return {
    ...base,
    transform: t != null ? CSS.Transform.toString(t) : undefined,
    transition: sortableStyle.transition,
    opacity: sortableStyle.isDragging ? 0.92 : 1,
    zIndex: sortableStyle.isDragging ? 5 : undefined,
  };
}

function StaticSectionCard({ fullWidth, children }) {
  return (
    <div style={sectionCardStyle(fullWidth, null)} className={styles.contactFormSectionCard}>
      <div className={styles.contactFormSectionBody}>{children}</div>
    </div>
  );
}

function SortableSection({ id, fullWidth, onSetFullWidth, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = sectionCardStyle(fullWidth, { transform, transition, isDragging });

  return (
    <div ref={setNodeRef} style={style} className={styles.contactFormSectionCard}>
      <div className={styles.contactFormSectionChrome}>
        <button
          type="button"
          className={styles.contactFormSectionDrag}
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          aria-label="Drag to reorder section"
        >
          ⠿
        </button>
        <label className={styles.contactFormSectionFullLabel}>
          <input
            type="checkbox"
            checked={!!fullWidth}
            onChange={(e) => onSetFullWidth(id, e.target.checked)}
          />
          <span>Full width</span>
        </label>
      </div>
      <div className={styles.contactFormSectionBody}>{children}</div>
    </div>
  );
}

function renderSegmentedView(order, fullWidthMap, renderSection, twoCol) {
  const segments = splitOrderSegments(order, fullWidthMap);
  return segments.map((seg, idx) => {
    if (seg.type === 'full') {
      return (
        <StaticSectionCard key={`full-${seg.id}-${idx}`} fullWidth>
          {renderSection(seg.id)}
        </StaticSectionCard>
      );
    }
    const { left, right } = pairBlockToColumns(seg.ids);
    if (!twoCol) {
      return (
        <React.Fragment key={`pair-${idx}`}>
          {seg.ids.map((sectionId) => (
            <StaticSectionCard key={sectionId} fullWidth={false}>
              {renderSection(sectionId)}
            </StaticSectionCard>
          ))}
        </React.Fragment>
      );
    }
    return (
      <div key={`pair-${idx}`} className={styles.contactFormTwoCol}>
        <div className={styles.contactFormCol}>
          {left.map((sectionId) => (
            <StaticSectionCard key={sectionId} fullWidth={false}>
              {renderSection(sectionId)}
            </StaticSectionCard>
          ))}
        </div>
        <div className={styles.contactFormCol}>
          {right.map((sectionId) => (
            <StaticSectionCard key={sectionId} fullWidth={false}>
              {renderSection(sectionId)}
            </StaticSectionCard>
          ))}
        </div>
      </div>
    );
  });
}

/** Same geometry as view: two flex columns + full-width rows — so arrange mode matches edit preview. */
function renderSegmentedArrange(order, fullWidthMap, renderSection, twoCol, onSetFullWidth) {
  const segments = splitOrderSegments(order, fullWidthMap);
  return segments.map((seg, idx) => {
    if (seg.type === 'full') {
      return (
        <SortableSection
          key={`full-${seg.id}-${idx}`}
          id={seg.id}
          fullWidth={!!fullWidthMap[seg.id]}
          onSetFullWidth={onSetFullWidth}
        >
          {renderSection(seg.id)}
        </SortableSection>
      );
    }
    const { left, right } = pairBlockToColumns(seg.ids);
    if (!twoCol) {
      return (
        <React.Fragment key={`pair-${idx}`}>
          {seg.ids.map((sectionId) => (
            <SortableSection
              key={sectionId}
              id={sectionId}
              fullWidth={!!fullWidthMap[sectionId]}
              onSetFullWidth={onSetFullWidth}
            >
              {renderSection(sectionId)}
            </SortableSection>
          ))}
        </React.Fragment>
      );
    }
    return (
      <div key={`pair-${idx}`} className={styles.contactFormTwoCol}>
        <div className={styles.contactFormCol}>
          {left.map((sectionId) => (
            <SortableSection
              key={sectionId}
              id={sectionId}
              fullWidth={!!fullWidthMap[sectionId]}
              onSetFullWidth={onSetFullWidth}
            >
              {renderSection(sectionId)}
            </SortableSection>
          ))}
        </div>
        <div className={styles.contactFormCol}>
          {right.map((sectionId) => (
            <SortableSection
              key={sectionId}
              id={sectionId}
              fullWidth={!!fullWidthMap[sectionId]}
              onSetFullWidth={onSetFullWidth}
            >
              {renderSection(sectionId)}
            </SortableSection>
          ))}
        </div>
      </div>
    );
  });
}

/**
 * View: two independent flex columns (no shared row heights) so short cards don’t leave gaps beside tall ones.
 * Arrange: same layout as view + drag handles (WYSIWYG preview while reordering).
 */
export function ContactFormSectionLayout({ layoutEditMode, columns, onColumnsChange, renderSection }) {
  const order = Array.isArray(columns?.order) ? columns.order : [];
  const fullWidth = columns?.fullWidth && typeof columns.fullWidth === 'object' ? columns.fullWidth : {};
  const twoCol = useTwoColumnLayout();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const onSetFullWidth = useCallback(
    (sectionId, checked) => {
      onColumnsChange((prev) => {
        const fw = { ...(prev.fullWidth || {}) };
        if (checked) fw[sectionId] = true;
        else delete fw[sectionId];
        return { ...prev, fullWidth: fw };
      });
    },
    [onColumnsChange]
  );

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const a = String(active.id);
      const o = String(over.id);
      onColumnsChange((prev) => {
        const list = [...(prev.order || [])];
        const oldIndex = list.indexOf(a);
        const newIndex = list.indexOf(o);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return { ...prev, order: arrayMove(list, oldIndex, newIndex) };
      });
    },
    [onColumnsChange]
  );

  if (order.length === 0) {
    return <p className={styles.formLayoutArrangeEmpty}>No sections</p>;
  }

  if (!layoutEditMode) {
    return (
      <div className={styles.formLayoutUnified}>
        <div className={styles.contactFormSectionViewRoot}>
          {renderSegmentedView(order, fullWidth, renderSection, twoCol)}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.formLayoutArrange}>
      <p className={styles.formLayoutArrangeHint}>
        Drag ⠿ to reorder — layout matches the form: two columns when not full width, full-width sections span the
        row.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className={`${styles.contactFormSectionViewRoot} ${styles.contactFormSectionGridArrange}`}>
            {renderSegmentedArrange(order, fullWidth, renderSection, twoCol, onSetFullWidth)}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
