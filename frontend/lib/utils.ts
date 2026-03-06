import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function statusColor(status: string) {
  switch (status) {
    case "healthy":
      return "text-emerald-400";
    case "moderate":
      return "text-amber-400";
    case "severe":
      return "text-red-400";
    default:
      return "text-zinc-400";
  }
}

export function statusBg(status: string) {
  switch (status) {
    case "healthy":
      return "bg-emerald-500/8 border-emerald-500/20";
    case "moderate":
      return "bg-amber-500/8 border-amber-500/20";
    case "severe":
      return "bg-red-500/8 border-red-500/20";
    default:
      return "bg-zinc-500/8 border-zinc-500/20";
  }
}
