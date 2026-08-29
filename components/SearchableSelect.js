'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export default function SearchableSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder,
  searchPlaceholder,
  emptyText,
  className
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((row) => String(row.value) === String(value));

  return (
    <div className={cn('block min-w-0', className)}>
      {label ? <span>{label}</span> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={typeof label === 'string' ? label : placeholder}
            className="mt-1 h-auto min-h-11 w-full justify-between whitespace-normal text-left font-normal"
          >
            <span className="min-w-0 flex-1 break-words">{selected?.label || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={String(opt.value)}
                    value={`${opt.label} ${opt.value}`}
                    disabled={opt.disabled}
                    onSelect={() => {
                      onChange(String(opt.value));
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', String(opt.value) === String(value) ? 'opacity-100' : 'opacity-0')} />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
