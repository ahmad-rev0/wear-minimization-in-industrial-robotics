import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function statusColor(status: string) {
  switch (status) {
    case "healthy":
      return "text-green-500";
    case "moderate":
      return "text-yellow-500";
    case "severe":
      return "text-red-500";
    default:
      return "text-zinc-400";
  }
}

export function statusBg(status: string) {
  switch (status) {
    case "healthy":
      return "bg-green-500/10 border-green-500/30";
    case "moderate":
      return "bg-yellow-500/10 border-yellow-500/30";
    case "severe":
      return "bg-red-500/10 border-red-500/30";
    default:
      return "bg-zinc-500/10 border-zinc-500/30";
  }
}
