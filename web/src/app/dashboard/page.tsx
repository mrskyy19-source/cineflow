"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type ViralClip = {
  title: string;
  start: number;
  end: number;
  caption: string;
  url: string;
};

type JobResult = {
  original_url: string;
  output_url: string;
  duration: string;
  resolution: string;
  viral_score: string;
  highlights: string[];
  clips?: ViralClip[];
};

type Item = {
  id: string;
  name: string;
  progress: number;
  status: string;
  result?: JobResult | null;
};

export default function Dashboard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => (r.ok ? r.json() : []))
      .then((jobs: any[]) => {
        if (Array.isArray(jobs) && jobs.length > 0) {
          setItems(
            jobs.map((j) => ({
              id: j.job_id,
              name: j.filename || j.s3_key,
              progress: j.progress ?? 100,
              status: j.stage || j.status,
              result: j.result,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  function updateItem(id: string, patch: Partial<Item>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  }

  function pollJob(itemId: string, jobId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs?jobId=${encodeURIComponent(jobId)}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "completed") {
          clearInterval(interval);
          updateItem(itemId, {
            progress: 100,
            status: "Completed ✓",
            result: data.result,
          });
        } else if (data.status === "failed") {
          clearInterval(interval);
          updateItem(itemId, { status: data.stage || "Processing failed" });
        } else {
          updateItem(itemId, {
            progress: data.progress ?? 50,
            status: data.stage || "Processing...",
          });
        }
      } catch {
        // retry next tick
      }
    }, 1000);
  }

  async function uploadAndProcess(file: File, tempId: string) {
    try {
      updateItem(tempId, { progress: 10, status: "Uploading raw footage..." });
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.key) {
        updateItem(tempId, {
          status: `Upload failed: ${uploadData.error || "Unknown error"}`,
        });
        return;
      }

      const jobId = `job-${Date.now()}`;
      updateItem(tempId, {
        id: jobId,
        progress: 20,
        status: "Dispatching to Whisper + FFmpeg worker...",
      });

      const jobRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          s3_key: uploadData.key,
          filename: file.name,
        }),
      });

      if (!jobRes.ok) {
        const errData = await jobRes.json().catch(() => ({}));
        updateItem(jobId, {
          status: `Worker error: ${errData.error || jobRes.statusText}`,
        });
        return;
      }

      pollJob(jobId, jobId);
    } catch (err: any) {
      updateItem(tempId, { status: `Error: ${err.message}` });
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newItems: Item[] = files.map((f) => ({
      id: `temp-${f.name}-${Date.now()}`,
      name: f.name,
      progress: 5,
      status: "Queued...",
    }));

    setItems((prev) => [...newItems, ...prev]);
    newItems.forEach((item, idx) => uploadAndProcess(files[idx], item.id));
    e.target.value = "";
  }

  return (
    <main className="container py-10 space-y-6">
      <h1 className="text-3xl font-bold">Your projects</h1>

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
            <div key={it.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex justify-between text-sm font-medium">
                <span className="truncate">{it.name}</span>
                <span className="text-muted-foreground">{it.status}</span>
              </div>
              <Progress value={it.progress} />

              {it.result && (
                <div className="mt-4 space-y-4 border-t pt-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Duration: <strong>{it.result.duration}</strong></span>
                      <span>Format: <strong>{it.result.resolution}</strong></span>
                      <span>Viral Score: <strong>{it.result.viral_score}</strong></span>
                    </div>
                    <a
                      href={it.result.output_url}
                      download
                      className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Download Captioned Master (.mp4)
                    </a>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Whisper Transcript & Highlights
                    </p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {it.result.highlights.map((h, i) => (
                        <li key={i}>• {h}</li>
                      ))}
                    </ul>
                  </div>

                  <video
                    src={it.result.output_url}
                    controls
                    className="max-h-96 w-full rounded-md bg-black"
                  />

                  {it.result.clips && it.result.clips.length > 0 && (
                    <div className="space-y-3 border-t pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Auto-Generated Viral Shorts ({it.result.clips.length})
                      </p>
                      <div className="grid gap-4 md:grid-cols-2">
                        {it.result.clips.map((clip, i) => (
                          <div key={i} className="space-y-2 rounded-md border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold">{clip.title}</span>
                              <a
                                href={clip.url}
                                download
                                className="rounded bg-secondary px-2 py-1 text-xs font-medium hover:opacity-80"
                              >
                                Download Short
                              </a>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {clip.start}s – {clip.end}s • &ldquo;{clip.caption}&rdquo;
                            </p>
                            <video
                              src={clip.url}
                              controls
                              className="max-h-60 w-full rounded bg-black"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
