"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Item = { id: string; name: string; size: number; progress: number };

export default function Dashboard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setItems((prev) => [
      ...prev,
      ...files.map((f) => ({
        id: `${f.name}-${f.size}-${Date.now()}`,
        name: f.name,
        size: f.size,
        progress: 0,
      })),
    ]);
    e.target.value = "";
  }

  return (
    <main className="container py-10">
      <h1 className="mb-6 text-3xl font-bold">Your projects</h1>

      <Card>
        <CardHeader>
          <CardTitle>Upload footage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            hidden
            onChange={onPick}
          />
          <Button onClick={() => inputRef.current?.click()}>
            Choose video files
          </Button>

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No files yet. Pick one or more videos to start.
            </p>
          )}

          {items.map((it) => (
            <div key={it.id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="truncate">{it.name}</span>
                <span className="text-muted-foreground">
                  {(it.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
              <Progress value={it.progress} />
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
