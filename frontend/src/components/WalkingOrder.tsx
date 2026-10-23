import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reorderProducts } from '@/lib/reorderProducts';
import type { CountProduct } from '@/types/api';

function Row({
  id,
  name,
  index,
  order,
  disabled,
  onChange,
}: {
  id: string;
  name: string;
  index: number;
  order: string[];
  disabled: boolean;
  onChange: (order: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-1 rounded-2xl border border-border bg-card p-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="touch-none"
        {...attributes}
        {...listeners}
        aria-label={`Mover ${name}`}
        disabled={disabled || order.length < 2}
      >
        <GripVertical />
      </Button>
      <span className="min-w-0 flex-1 font-semibold break-words">
        {index + 1}. {name}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Subir ${name}`}
        disabled={disabled || index === 0}
        onClick={() => onChange(reorderProducts(order, id, order[index - 1]))}
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Bajar ${name}`}
        disabled={disabled || index === order.length - 1}
        onClick={() => onChange(reorderProducts(order, id, order[index + 1]))}
      >
        <ArrowDown />
      </Button>
    </li>
  );
}

export function WalkingOrder({
  products,
  order,
  onOrderChange,
  disabled,
  onDraggingChange,
}: {
  products: CountProduct[];
  order: string[];
  onOrderChange: (order: string[]) => void;
  disabled: boolean;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  if (!order.length) return null;
  return (
    <section aria-labelledby="walking-order" className="space-y-2">
      <h2 id="walking-order" className="text-base font-extrabold">
        Orden de recorrido
      </h2>
      <p className="text-sm">Arrastrá desde el agarre para cambiar el orden.</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => onDraggingChange(true)}
        onDragCancel={() => onDraggingChange(false)}
        onDragEnd={({ active, over }) => {
          onDraggingChange(false);
          if (!disabled)
            onOrderChange(
              reorderProducts(
                order,
                String(active.id),
                over ? String(over.id) : null
              )
            );
        }}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {order.map((id, index) => (
              <Row
                key={id}
                id={id}
                name={
                  products.find((p) => p.id === id)?.name ??
                  'Producto no disponible'
                }
                index={index}
                order={order}
                disabled={disabled}
                onChange={onOrderChange}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}
