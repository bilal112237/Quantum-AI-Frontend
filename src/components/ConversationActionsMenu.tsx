import { useEffect, useRef, useState } from 'react';
import type { Conversation } from '../types';

type Props = {
  conversation: Conversation;
  onPin: (e: React.MouseEvent) => void;
  onRename: () => void;
  onArchive: (e: React.MouseEvent) => void;
    onExport: () => void;
  onDelete: () => void;
};

export function ConversationActionsMenu({
  conversation,
  onPin,
  onRename,
  onArchive,
  onExport,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="conv-menu" ref={rootRef}>
      <button
        type="button"
        className="conv-menu-trigger"
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More options"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open ? (
        <div className="conv-menu-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onPin(e);
            }}
          >
            {conversation.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRename();
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onArchive(e);
            }}
          >
            {conversation.archived ? 'Unarchive' : 'Archive'}
          </button>
                    <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onExport();
            }}
          >
            Export as Markdown
          </button>
          <hr />
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
