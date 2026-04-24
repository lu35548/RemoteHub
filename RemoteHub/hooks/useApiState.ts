// Custom hooks for API state management
// Provides loading states, error handling, and retry functionality

import { useState, useEffect, useCallback } from 'react';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export interface ApiAction<T> {
  execute: () => Promise<T>;
  loading: boolean;
  error: string | null;
  data: T | null;
  reset: () => void;
  retry: () => Promise<void>;
}

// Hook for managing API request state
export function useApiState<T>(
  apiCall: () => Promise<T>,
  dependencies: any[] = []
): ApiState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
    lastUpdated: null
  });

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await apiCall();
      setState({
        data: result,
        loading: false,
        error: null,
        lastUpdated: Date.now()
      });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'An error occurred',
        lastUpdated: null
      });
    }
  }, dependencies);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    ...state,
    refetch: execute
  };
}

// Hook for manual API execution with state management
export function useApiAction<T>(apiCall: () => Promise<T>): ApiAction<T> {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: T | null;
  }>({
    loading: false,
    error: null,
    data: null
  });

  const execute = useCallback(async (): Promise<T> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await apiCall();
      setState({
        loading: false,
        error: null,
        data: result
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setState({
        loading: false,
        error: errorMessage,
        data: null
      });
      throw error;
    }
  }, [apiCall]);

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      data: null
    });
  }, []);

  const retry = useCallback(async () => {
    await execute();
  }, [execute]);

  return {
    execute,
    loading: state.loading,
    error: state.error,
    data: state.data,
    reset,
    retry
  };
}

// Hook for debounced API calls
export function useDebouncedApi<T>(
  apiCall: () => Promise<T>,
  delay: number = 300,
  dependencies: any[] = []
): ApiState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
    lastUpdated: null
  });

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    // Debounce the API call
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const result = await apiCall();
      setState({
        data: result,
        loading: false,
        error: null,
        lastUpdated: Date.now()
      });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'An error occurred',
        lastUpdated: null
      });
    }
  }, [delay, ...dependencies]);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    ...state,
    refetch: execute
  };
}

// Hook for paginated API calls
export function usePaginatedApi<T>(
  apiCall: (page: number, limit: number) => Promise<{ data: T[]; total: number }>,
  initialPage: number = 1,
  pageSize: number = 10
) {
  const [state, setState] = useState<{
    data: T[];
    loading: boolean;
    error: string | null;
    page: number;
    total: number;
    hasMore: boolean;
  }>({
    data: [],
    loading: false,
    error: null,
    page: initialPage,
    total: 0,
    hasMore: true
  });

  const loadPage = useCallback(async (page: number = state.page) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await apiCall(page, pageSize);
      setState(prev => ({
        ...prev,
        data: page === initialPage ? result.data : [...prev.data, ...result.data],
        loading: false,
        page,
        total: result.total,
        hasMore: result.data.length === pageSize && (prev.data.length + result.data.length) < result.total
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'An error occurred'
      }));
    }
  }, [apiCall, pageSize, initialPage, state.page]);

  const loadMore = useCallback(() => {
    if (state.hasMore && !state.loading) {
      loadPage(state.page + 1);
    }
  }, [loadPage, state.page, state.hasMore, state.loading]);

  const reset = useCallback(() => {
    setState({
      data: [],
      loading: false,
      error: null,
      page: initialPage,
      total: 0,
      hasMore: true
    });
  }, [initialPage]);

  useEffect(() => {
    loadPage();
  }, []);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    page: state.page,
    total: state.total,
    hasMore: state.hasMore,
    loadPage,
    loadMore,
    reset
  };
}

// Hook for real-time data updates
export function useRealtimeApi<T>(
  apiCall: () => Promise<T>,
  interval: number = 30000,
  dependencies: any[] = []
) {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
    lastUpdated: null
  });

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await apiCall();
      setState({
        data: result,
        loading: false,
        error: null,
        lastUpdated: Date.now()
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'An error occurred'
      }));
    }
  }, dependencies);

  useEffect(() => {
    fetchData();

    const intervalId = setInterval(fetchData, interval);
    return () => clearInterval(intervalId);
  }, [fetchData, interval]);

  return {
    ...state,
    refetch: fetchData
  };
}

// Hook for cached API calls
export function useCachedApi<T>(
  key: string,
  apiCall: () => Promise<T>,
  ttl: number = 5 * 60 * 1000 // 5 minutes default TTL
): ApiState<T> & { refetch: () => Promise<void>; clearCache: () => void } {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
    lastUpdated: null
  });

  const getCachedData = useCallback((): { data: T | null; timestamp: number } | null => {
    const cached = localStorage.getItem(`api_cache_${key}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return null;
  }, [key]);

  const setCachedData = useCallback((data: T) => {
    localStorage.setItem(`api_cache_${key}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  }, [key]);

  const clearCache = useCallback(() => {
    localStorage.removeItem(`api_cache_${key}`);
  }, [key]);

  const fetchData = useCallback(async (forceRefresh: boolean = false) => {
    const cached = getCachedData();

    // Return cached data if it's still valid
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < ttl) {
      setState({
        data: cached.data,
        loading: false,
        error: null,
        lastUpdated: cached.timestamp
      });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await apiCall();
      setCachedData(result);
      setState({
        data: result,
        loading: false,
        error: null,
        lastUpdated: Date.now()
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'An error occurred'
      }));
    }
  }, [apiCall, getCachedData, setCachedData, ttl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refetch: () => fetchData(true),
    clearCache
  };
}