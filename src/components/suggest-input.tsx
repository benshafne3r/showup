"use client";

import { type ComponentProps, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A text input with type-ahead suggestions (a combobox). Typing stays free
 * text; picking a suggestion hands it to `onPick`, which can fill other fields.
 * Arrow keys move, Enter picks, Escape closes.
 */
export function SuggestInput<T>({
  value,
  onValueChange,
  suggest,
  itemKey,
  renderItem,
  onPick,
  className,
  ...input
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  suggest: (query: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onPick: (item: T) => void;
}) {
  const listId = useId();
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const lookup = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++request.current;
    if (text.trim().length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const found = await suggest(text).catch(() => []);
      if (id !== request.current) return; // a newer keystroke won
      setItems(found);
      setActive(-1);
      setOpen(found.length > 0);
    }, 250);
  };

  const pick = (item: T) => {
    request.current++; // drop any lookup still in flight
    setOpen(false);
    setItems([]);
    onPick(item);
  };

  return (
    <div className="relative">
      <Input
        {...input}
        className={className}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          lookup(e.target.value);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {items.map((item, i) => (
            <li
              key={itemKey(item)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep focus in the input so blur doesn't close the list first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-pointer rounded-md px-2 py-1.5 text-sm", i === active && "bg-muted")}
            >
              {renderItem(item)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
