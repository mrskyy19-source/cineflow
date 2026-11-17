import { clsx, type ClassValue } from "clsx"; import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function formatDuration(sec: number) { const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=Math.floor(sec%60); return [h>0?h:null, m>0?String(m).padStart(2,"0"):"00", String(s).padStart(2,"0")].filter(Boolean).join(":"); }
export function formatFileSize(bytes: number) { if(bytes===0) return "0 B"; const k=1024, sizes=["B","KB","MB","GB","TB"], i=Math.floor(Math.log(bytes)/Math.log(k)); return parseFloat((bytes/Math.pow(k,i)).toFixed(2))+" "+sizes[i]; }
export function generateId() { return Math.random().toString(36).substring(2, 15); }
