
    import { useState, useCallback } from 'react'; import toast from 'react-hot-toast';
    export const useApi = <T extends (...args: any[]) => Promise<any>>(apiFn: T) => {
        const [isLoading, setIsLoading] = useState(false);
        const call = useCallback(async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
            setIsLoading(true);
            try { return await apiFn(...args); }
            catch (error) { toast.error(error instanceof Error ? error.message : '发生未知错误'); return null; }
            finally { setIsLoading(false); }
        }, [apiFn]);
        return { call, isLoading };
    };
  