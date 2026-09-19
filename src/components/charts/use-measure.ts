"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measures an element's content box.
 *
 * Charts are drawn at real pixel dimensions rather than scaled from a viewBox,
 * so axis labels stay at their true size instead of growing and shrinking with
 * the container.
 */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
