"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function visibleFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0,
  );
}

function isTopmostModal(dialog: HTMLElement): boolean {
  const openModals = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]',
  );
  return openModals.item(openModals.length - 1) === dialog;
}

/**
 * Shared keyboard and focus behavior for modal surfaces.
 *
 * The caller still owns rendering and animation. This hook provides an
 * initial focus target, traps Tab inside the topmost modal, closes on Escape,
 * and restores focus to the element that opened the modal.
 */
export function useModalAccessibility<T extends HTMLElement>({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusFrame = requestAnimationFrame(() => {
      const autofocus = dialog.querySelector<HTMLElement>("[autofocus]");
      const first = visibleFocusableElements(dialog)[0];
      (autofocus ?? first ?? dialog).focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostModal(dialog)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = visibleFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected) {
        requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
      }
    };
  }, [open]);

  return dialogRef;
}
