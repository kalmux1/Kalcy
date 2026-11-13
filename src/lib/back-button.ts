import { useEffect, useRef } from 'react';

type BackHandler = () => boolean;
const handlers: BackHandler[] = [];

let isBackNavigation = false;
let ignoreNextPopState = false;

export function useBackButton(handler: BackHandler, isOpen: boolean): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // Manage history stack
  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ app: true }, '');
      return () => {
        if (!isBackNavigation) {
          // If the modal is closed programmatically (not via the browser back button),
          // we need to pop the history state we pushed. We set a flag to tell the
          // global popstate listener to ignore this specific event.
          ignoreNextPopState = true;
          window.history.back();
        }
        isBackNavigation = false;
      };
    }
  }, [isOpen]);

  // Manage handlers
  useEffect(() => {
    if (!isOpen) return;

    const wrappedHandler = () => {
      const result = handlerRef.current();
      if (result) {
        isBackNavigation = true;
      }
      return result;
    };
    handlers.push(wrappedHandler);
    return () => {
      const index = handlers.indexOf(wrappedHandler);
      if (index > -1) handlers.splice(index, 1);
    };
  }, [isOpen]);
}

export function registerGlobalBackButton() {
  if (typeof window === 'undefined') return Promise.resolve(null);

  // Push initial dummy state
  window.history.pushState({ app: true }, '');

  const handlePopState = () => {
    if (ignoreNextPopState) {
      ignoreNextPopState = false;
      return;
    }

    // Execute handlers from top-most (last added) to bottom-most
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]()) {
        // Handler caught it, modal is now closed.
        // Push state back to catch the next back.
        window.history.pushState({ app: true }, '');
        return;
      }
    }
    // No handler caught it, allow browser to go back
  };

  window.addEventListener('popstate', handlePopState);

  return Promise.resolve({
    remove: () => {
      window.removeEventListener('popstate', handlePopState);
    },
  });
}