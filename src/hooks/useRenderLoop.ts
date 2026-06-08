"use client";

import { useEffect, useRef } from "react";
import { renderLoop } from "@/lib/render-loop";

export function useRenderLoop(
  callback: (delta: number) => void,
  deps: React.DependencyList = []
) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const unsubscribe = renderLoop.subscribe((delta) => {
      savedCallback.current(delta);
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
