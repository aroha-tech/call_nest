import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  defaultDropAnimationSideEffects,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  defaultAnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './ContactFormPage.module.scss';

const animateLayoutChanges = (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const dropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: { opacity: '0.4' },
    },
  }),
};

function findContainer(columns, itemId) {
  const id = String(itemId);
  if (columns.left.includes(id)) return 'left';
  if (columns.right.includes(id)) return 'right';
  return null;
}

function SortableSection({ id, layoutEditMode, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !layoutEditMode,
    animateLayoutChanges,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  if (children == null) return null;

  return (
    <div ref={setNodeRef} style={style} className={layoutEditMode ? styles.sortableSectionWrap : undefined}>
      {layoutEditMode ? (
        <div className={styles.sortableSectionInner}>
          <button
            type="button"
            className={styles.sectionDragHandle}
            {...attributes}
            {...listeners}
            aria-label="Drag section to reorder or move to other column"
          >
            <span aria-hidden className={styles.sectionDragGrip}>
              <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                <circle cx="3" cy="3" r="1.5" />
                <circle cx="7" cy="3" r="1.5" />
                <circle cx="3" cy="8" r="1.5" />
                <circle cx="7" cy="8" r="1.5" />
                <circle cx="3" cy="13" r="1.5" />
                <circle cx="7" cy="13" r="1.5" />
              </svg>
            </span>
          </button>
          <div className={styles.sectionDragContent}>{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Column({ items, layoutEditMode, renderSection }) {
  return (
    <div className={styles.formLayoutCol}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {items.map((sectionId) => (
          <SortableSection key={sectionId} id={sectionId} layoutEditMode={layoutEditMode}>
            {renderSection(sectionId)}
          </SortableSection>
        ))}
      </SortableContext>
    </div>
  );
}

/**
 * Two-column layout with optional drag-and-drop reordering and cross-column moves.
 * Cross-column uses live onDragOver updates + DragOverlay so moves feel smooth (dnd-kit multi-container pattern).
 */
export function ContactFormDraggableColumns({ layoutEditMode, columns, onColumnsChange, renderSection }) {
  const [activeDragId, setActiveDragId] = useState(null);
  const activeDragIdRef = useRef(null);
  const lastOverId = useRef(null);
  const recentlyMovedToNewContainer = useRef(false);
  const columnsSnapshot = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [columns]);

  const collisionDetectionStrategy = useCallback((args) => {
    const pointerIntersections = pointerWithin(args);
    const intersections =
      pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);
    let overId = getFirstCollision(intersections, 'id');

    if (overId != null) {
      lastOverId.current = overId;
      return [{ id: overId }];
    }

    if (recentlyMovedToNewContainer.current && activeDragIdRef.current) {
      lastOverId.current = activeDragIdRef.current;
    }

    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = ({ active }) => {
    const id = String(active.id);
    activeDragIdRef.current = id;
    setActiveDragId(id);
    lastOverId.current = null;
    columnsSnapshot.current = {
      left: [...columns.left],
      right: [...columns.right],
    };
  };

  const handleDragCancel = () => {
    if (columnsSnapshot.current) {
      onColumnsChange(columnsSnapshot.current);
    }
    activeDragIdRef.current = null;
    setActiveDragId(null);
    columnsSnapshot.current = null;
    lastOverId.current = null;
  };

  const handleDragOver = ({ active, over }) => {
    if (!layoutEditMode) return;
    const overId = over?.id;
    if (overId == null) return;

    const activeId = String(active.id);
    const overIdStr = String(overId);
    if (activeId === overIdStr) return;

    onColumnsChange((prev) => {
      const activeContainer = findContainer(prev, activeId);
      const overContainer = findContainer(prev, overIdStr);
      if (!activeContainer || !overContainer) return prev;
      if (activeContainer === overContainer) return prev;

      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const overIndex = overItems.indexOf(overIdStr);
      const activeIndex = activeItems.indexOf(activeId);
      if (activeIndex === -1) return prev;

      const isBelowOverItem =
        over &&
        active.rect.current.translated &&
        active.rect.current.translated.top > over.rect.top + over.rect.height;
      const modifier = isBelowOverItem ? 1 : 0;
      const newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;

      recentlyMovedToNewContainer.current = true;

      const movingItem = activeItems[activeIndex];
      return {
        ...prev,
        [activeContainer]: activeItems.filter((item) => item !== activeId),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          movingItem,
          ...overItems.slice(newIndex),
        ],
      };
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    activeDragIdRef.current = null;
    setActiveDragId(null);
    columnsSnapshot.current = null;
    lastOverId.current = null;

    if (!layoutEditMode) return;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    onColumnsChange((prev) => {
      const activeCol = findContainer(prev, activeId);
      const overCol = findContainer(prev, overId);
      if (!activeCol || !overCol) return prev;

      if (activeCol === overCol) {
        const list = prev[activeCol];
        const oldIndex = list.indexOf(activeId);
        const newIndex = list.indexOf(overId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
        return {
          ...prev,
          [activeCol]: arrayMove(list, oldIndex, newIndex),
        };
      }

      const fromList = prev[activeCol].filter((id) => id !== activeId);
      const toList = [...prev[overCol]];
      const overIndex = toList.indexOf(overId);
      if (overIndex === -1) {
        toList.push(activeId);
      } else {
        toList.splice(overIndex, 0, activeId);
      }
      return {
        ...prev,
        [activeCol]: fromList,
        [overCol]: toList,
      };
    });
  };

  const grid = (
    <div className={styles.formLayout}>
      <Column items={columns.left} layoutEditMode={layoutEditMode} renderSection={renderSection} />
      <Column items={columns.right} layoutEditMode={layoutEditMode} renderSection={renderSection} />
    </div>
  );

  if (!layoutEditMode) return grid;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      dropAnimation={dropAnimation}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {grid}
      <DragOverlay dropAnimation={dropAnimation}>
        {activeDragId ? (
          <div className={styles.sectionDragOverlay}>{renderSection(activeDragId)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
