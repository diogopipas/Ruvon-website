"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  locked = false,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  locked?: boolean;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal-content ${className}`}
          onEscapeKeyDown={(e) => {
            if (locked) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (locked) e.preventDefault();
          }}
        >
          <Dialog.Title className="modal-title">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="modal-description">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {!locked && (
            <Dialog.Close
              className="icon-button modal-close"
              aria-label="Fechar"
            >
              <X size={20} />
            </Dialog.Close>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
