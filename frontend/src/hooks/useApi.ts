import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { ApiResponse, PaginatedResponse } from '@/types';

// Generic hook for GET requests
export function useApiQuery<T>(
  key: string[],
  url: string,
  params?: Record<string, any>,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
  }
) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const response = await apiService.get<T>(url, params);
      return response.data;
    },
    enabled: options?.enabled,
    staleTime: options?.staleTime || 5 * 60 * 1000, // 5 minutes
    cacheTime: options?.cacheTime || 10 * 60 * 1000, // 10 minutes
  });
}

// Generic hook for paginated GET requests
export function usePaginatedQuery<T>(
  key: string[],
  url: string,
  params?: Record<string, any>,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
  }
) {
  return useQuery<PaginatedResponse<T>>({
    queryKey: key,
    queryFn: async () => {
      const response = await apiService.getPaginated<T>(url, params);
      return response;
    },
    enabled: options?.enabled,
    staleTime: options?.staleTime || 5 * 60 * 1000,
    cacheTime: options?.cacheTime || 10 * 60 * 1000,
  });
}

// Generic hook for POST requests
export function useApiMutation<TData, TVariables = any>(
  url: string,
  options?: {
    onSuccess?: (data: ApiResponse<TData>) => void;
    onError?: (error: any) => void;
    invalidateQueries?: string[][];
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: TVariables) => apiService.post<TData>(url, variables),
    onSuccess: (data) => {
      if (options?.invalidateQueries) {
        options.invalidateQueries.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      }
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}

// Generic hook for PUT requests
export function useApiUpdateMutation<TData, TVariables = any>(
  url: string,
  options?: {
    onSuccess?: (data: ApiResponse<TData>) => void;
    onError?: (error: any) => void;
    invalidateQueries?: string[][];
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: TVariables) => apiService.put<TData>(url, variables),
    onSuccess: (data) => {
      if (options?.invalidateQueries) {
        options.invalidateQueries.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      }
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}

// Generic hook for DELETE requests
export function useApiDeleteMutation<TData = any>(
  url: string,
  options?: {
    onSuccess?: (data: ApiResponse<TData>) => void;
    onError?: (error: any) => void;
    invalidateQueries?: string[][];
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiService.delete<TData>(url),
    onSuccess: (data) => {
      if (options?.invalidateQueries) {
        options.invalidateQueries.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      }
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}

// File upload hook
export function useFileUploadMutation(
  url: string,
  options?: {
    onSuccess?: (data: ApiResponse<any>) => void;
    onError?: (error: any) => void;
    onProgress?: (progress: number) => void;
    invalidateQueries?: string[][];
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => apiService.uploadFile(url, file, options?.onProgress),
    onSuccess: (data) => {
      if (options?.invalidateQueries) {
        options.invalidateQueries.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      }
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}