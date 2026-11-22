export function select(
  tools: Array<{ name: string; [key: string]: unknown }>,
  options?: { goal?: string; maxTools?: number; include?: string[]; exclude?: string[] }
): Array<{ name: string; [key: string]: unknown }>;
