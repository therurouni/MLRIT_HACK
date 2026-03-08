import { useState, useCallback } from "react";

export function useApi<T>(apiFn: (...args: any[]) => Promise<T>) {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const execute = useCallback(
		async (...args: any[]) => {
			setLoading(true);
			setError(null);
			try {
				const result = await apiFn(...args);
				setData(result);
				return result;
			} catch (e: any) {
				setError(e.message || "Unknown error");
				throw e;
			} finally {
				setLoading(false);
			}
		},
		[apiFn],
	);

	return { data, loading, error, execute };
}
