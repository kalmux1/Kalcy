'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryIcon, AVAILABLE_ICONS, CATEGORY_COLORS } from '@/components/icon-map';
import { useStore } from '@/lib/store';
import type { Category, TransactionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function CategoriesView() {
  const { categories, addCategory, updateCategory, deleteCategory } = useStore();
  const [activeType, setActiveType] = useState<TransactionType>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const expenseCategories = categories.filter((c) => c.type === 'expense' && !c.parentId);
  const incomeCategories = categories.filter((c) => c.type === 'income' && !c.parentId);
  
  const currentCategories = activeType === 'expense' ? expenseCategories : incomeCategories;

  const confirmDelete = (cat: Category) => {
    toast(`Delete "${cat.name}"? Any transactions using this category will become Uncategorized.`, {
      duration: 8000,
      action: {
        label: 'Delete',
        onClick: async () => {
          try {
            await deleteCategory(cat.id);
            toast.success('Category deleted');
          } catch (err) {
            console.error(err);
            toast.error('Failed to delete category');
          }
        },
      },
      cancel: { label: 'Cancel', onClick: () => {} },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold">Categories</h2>
        <Button size="sm" onClick={() => setIsAdding(true)} className="rounded-xl h-8 text-xs gap-1">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-xl max-w-xs">
        {(['expense', 'income'] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveType(t)}
            className={cn(
              'flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all',
              activeType === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {currentCategories.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground bg-muted/20 rounded-2xl">
            No {activeType} categories yet. Click Add to create one.
          </div>
        ) : (
          currentCategories.map((cat) => {
            const subs = categories.filter((c) => c.parentId === cat.id);

            return (
              <div key={cat.id} className="bg-card rounded-2xl border border-border/40 overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cat.color}1A` }}
                  >
                    <span style={{ color: cat.color }}>
                      <CategoryIcon name={cat.icon} size={20} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{cat.name}</p>
                    {subs.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">{subs.length} subcategories</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => setEditing(cat)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => confirmDelete(cat)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {subs.length > 0 && (
                  <div className="border-t border-border/40 bg-muted/10 pl-12 pr-3 py-1">
                    {subs.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-3 py-2">
                        <div
                          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${sub.color}1A` }}
                        >
                          <span style={{ color: sub.color }}>
                            <CategoryIcon name={sub.icon} size={14} />
                          </span>
                        </div>
                        <span className="flex-1 text-sm">{sub.name}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => setEditing(sub)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => confirmDelete(sub)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <CategorySheet
        open={isAdding || editing !== null}
        category={editing}
        defaultType={activeType}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdding(false);
            setEditing(null);
          }
        }}
        onSave={async (data, id) => {
          try {
            if (id) {
              await updateCategory(id, data);
              toast.success('Category updated');
            } else {
              await addCategory(data);
              toast.success('Category added');
            }
            setIsAdding(false);
            setEditing(null);
          } catch (err) {
            console.error(err);
            toast.error('Failed to save category');
          }
        }}
      />
    </div>
  );
}

function CategorySheet({
  open,
  category,
  defaultType,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  category: Category | null;
  defaultType: TransactionType;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Omit<Category, 'id' | 'order'>, id?: string) => void | Promise<void>;
}) {
  const { categories } = useStore();
  const formKey = open ? category?.id ?? 'new' : 'closed';

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="rounded-t-[2rem] md:rounded-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 px-4 pt-2 pb-3 md:pt-6 flex items-center justify-between border-b border-border/40">
          <h2 className="text-xl font-bold">
            {category ? 'Edit Category' : 'New Category'}
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4 pb-32">
          <CategoryForm
            key={formKey}
            initial={category}
            defaultType={defaultType}
            categories={categories}
            onCancel={() => onOpenChange(false)}
            onSubmit={(data) => onSave(data, category?.id)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function CategoryForm({
  initial,
  defaultType,
  categories,
  onCancel,
  onSubmit,
}: {
  initial: Category | null;
  defaultType: TransactionType;
  categories: Category[];
  onCancel: () => void;
  onSubmit: (data: Omit<Category, 'id' | 'order'>) => void;
}) {
  const [type, setType] = useState<TransactionType>(initial?.type ?? defaultType);
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'MoreHorizontal');
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [parentId, setParentId] = useState<string>(initial?.parentId ?? '');

  // Only allow selecting a parent if we are creating a new category (no nesting deeper than 1 level)
  const availableParents = categories.filter((c) => c.type === type && !c.parentId && c.id !== initial?.id);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Enter a category name');
      return;
    }

    onSubmit({
      name: name.trim(),
      type,
      icon,
      color,
      parentId: parentId || null,
      isHidden: false,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/40">
        <div
          className="h-12 w-12 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${color}1A` }}
        >
          <span style={{ color }}>
            <CategoryIcon name={icon} size={24} />
          </span>
        </div>
        <div>
          <p className="font-semibold text-sm">{name || 'Category Name'}</p>
          <p className="text-xs text-muted-foreground capitalize">{type}</p>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Type</Label>
        <div className="flex gap-2 mt-1 max-w-sm">
          {(['expense', 'income'] as TransactionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setType(t); setParentId(''); }}
              className={cn(
                'flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all',
                type === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Category Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Subscriptions"
          className="mt-1 rounded-xl"
        />
      </div>

      {!initial && availableParents.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground">Parent Category (Optional)</Label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
          >
            <option value="">None (Top-level)</option>
            {availableParents.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label className="text-xs text-muted-foreground">Icon</Label>
        <div className="grid grid-cols-6 gap-2 mt-1">
          {AVAILABLE_ICONS.slice(0, 24).map((iconName) => (
            <button
              key={iconName}
              type="button"
              onClick={() => setIcon(iconName)}
              aria-label={`Icon ${iconName}`}
              className={cn(
                'aspect-square w-full rounded-xl flex items-center justify-center transition-all',
                icon === iconName ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              <CategoryIcon name={iconName} size={18} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Color</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={cn(
                'aspect-square w-8 rounded-full transition-all',
                color === c && 'ring-2 ring-offset-2 ring-ring scale-110'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] md:pb-4 bg-background border-t flex gap-2">
        <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <Button type="button" className="flex-1 rounded-xl" onClick={handleSubmit}>
          <Check className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}