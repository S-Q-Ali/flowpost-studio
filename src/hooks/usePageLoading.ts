import { useState, useRef, useEffect } from "react";

export function usePageLoading(timeoutMs = 15000) {
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    const timer = setTimeout(() => setLoading(false), timeoutMs);
    return () => {
      cancelledRef.current = true;
      clearTimeout(timer);
    };
  }, [timeoutMs]);

  const done = () => {
    if (!cancelledRef.current) setLoading(false);
  };

  return { loading, done };
}
