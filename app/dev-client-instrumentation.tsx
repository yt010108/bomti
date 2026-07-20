"use client";

import { useEffect } from "react";

export function DevClientInstrumentation() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.debug("[bomti:dev] client instrumentation active");
    }
  }, []);

  return null;
}
