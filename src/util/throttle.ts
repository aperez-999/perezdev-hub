/** Coalesce streamed tokens so Ink is not asked to re-render on every chunk. */
export function throttleAppend(onFlush: (chunk: string) => void, ms = 48): { push: (t: string) => void; flush: () => void } {
  let buf = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const drain = (): void => {
    timer = null;
    if (!buf) return;
    const chunk = buf;
    buf = "";
    onFlush(chunk);
  };
  return {
    push(t: string) {
      if (!t) return;
      buf += t;
      if (timer == null) timer = setTimeout(drain, ms);
    },
    flush() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      drain();
    },
  };
}
