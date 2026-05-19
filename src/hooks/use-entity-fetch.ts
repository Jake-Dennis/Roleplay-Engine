/**
 * useEntityFetch Hook
 *
 * Generic data fetching with loading state.
 * Replaces the identical fetch/useEffect pattern used in 16+ pages.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useEntityFetch("/api/wiki", "pages");
 */

import { useState, useEffect, useCallback } from "react";

interface UseEntityFetchResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useEntityFetch<T = any>(
  endpoint: string,
  dataKey?: string
): UseEntityFetchResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const json = await res.json();
      const key = dataKey || endpoint.split("/").pop() || "";
      setData(json[key] || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, dataKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
