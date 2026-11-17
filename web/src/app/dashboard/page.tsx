"use client";

import React, { useEffect, useRef, useState } from "react";

interface ClipItem {
  title: string;
  start: number;
  end: number;
  caption: string;
  viral_score?: string;
  url: string;
}

interface JobRecord {
  job_id: string;
  user_id?: string;
  filename: string;
  s3_key: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stage?: string;
  created_at?: string;
  result?: {
    original_url: string;
    output_url: string;
    duration: string;
    resolution: string;
    viral_score: string;
    highlights: string[];
    clips?: ClipItem[];
    social_copy?: {
      title?: string;
      description?: string;
      hashtags?: string[];
    };
  } | null;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [buyingCredits, setBuyingCredits] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/jobs?userId=local-user", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setJobs(data);
      }
    } catch {
      // Ignore transient network hiccups during polling
    }
  };

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 3500);
    return () => clearInterval(timer);
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        let key = "";

        // 1. Try direct Cloudflare R2 presigned upload first
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type || "video/mp4" }),
        });
        const presign = await presignRes.json();

        if (presign.mode === "r2" && presign.uploadUrl) {
          const putRes = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "video/mp4" },
            body: file,
          });
          if (!putRes.ok) throw new Error("R2 direct upload failed");
          key = presign.key;
        } else {
          // 2. Fallback to standard multipart upload
          const fd = new FormData();
          fd.append("file", file);
          const upRes = await fetch("/api/upload", { method: "POST", body: fd });
          const upData = await upRes.json();
          if (!upRes.ok) throw new Error(upData.error || "Upload failed");
          key = upData.key;
        }

        // 3. Dispatch job to worker
        const jobRes = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            s3Key: key,
            filename: file.name,
            userId: "local-user",
          }),
        });
        const created = await jobRes.json();
        if (created?.job_id) setExpandedId(created.job_id);
      }
      await fetchJobs();
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteJob = async (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    await fetch(`/api/jobs?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE" });
  };

  const clearIncomplete = async () => {
    setJobs((prev) => prev.filter((j) => j.status === "completed"));
    await fetch("/api/jobs?status=incomplete", { method: "DELETE" });
  };

  const handleTopUp = async () => {
    setBuyingCredits(true);
    try {
      const res = await fetch("/api/billing/paystack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "creator@cineflow.ai", userId: "local-user", packId: "starter" }),
      });
      const data = await res.json();
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        alert(data.error || "Add PAYSTACK_SECRET_KEY in Render to enable checkout.");
      }
    } finally {
      setBuyingCredits(false);
    }
  };

  const hasIncomplete = jobs.some((j) => j.status !== "completed");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CineFlow Studio</h1>
            <p className="text-sm text-slate-500 mt-1">
              9:16 vertical reframe, word-by-word animated captions & AI viral hooks
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasIncomplete && (
              <button
                onClick={clearIncomplete}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition"
              >
                Clear Incomplete
              </button>
            )}
            <button
              onClick={handleTopUp}
              disabled={buyingCredits}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
            >
              {buyingCredits ? "Connecting..." : "Top Up Minutes"}
            </button>
          </div>
        </div>

        {/* Upload Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="bg-white border-2 border-dashed border-slate-200 hover:border-violet-400 rounded-2xl p-8 text-center transition mb-8"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <p className="text-base font-semibold text-slate-800">
            Drop raw footage here or choose video files
          </p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            MP4, MOV, or WebM • Auto-transcribed & rendered in 720x1280 9:16
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-sm transition disabled:opacity-50"
          >
            {uploading ? "Uploading footage..." : "Choose video files"}
          </button>
        </div>

        {/* Projects List */}
        <div className="space-y-4">
          {jobs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
              No projects yet. Upload a video above to generate your first 9:16 master and viral clips.
            </div>
          ) : (
            jobs.map((job) => {
              const isDone = job.status === "completed";
              const isFailed = job.status === "failed";
              const isOpen = expandedId === job.job_id || (isDone && jobs.length === 1);

              return (
                <div
                  key={job.job_id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {job.filename}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                            isDone
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : isFailed
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-violet-50 text-violet-700 border border-violet-200"
                          }`}
                        >
                          {isDone ? "Completed" : isFailed ? "Failed" : `${job.progress || 10}%`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        {job.stage || (isDone ? "Ready to download" : "Processing...")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isDone && (
                        <button
                          onClick={() => setExpandedId(isOpen ? null : job.job_id)}
                          className="px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition"
                        >
                          {isOpen ? "Hide Studio" : "Open Studio"}
                        </button>
                      )}
                      <button
                        onClick={() => deleteJob(job.job_id)}
                        title="Delete project"
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {!isDone && (
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isFailed ? "bg-rose-500" : "bg-violet-600"
                        }`}
                        style={{ width: `${Math.max(8, job.progress || 10)}%` }}
                      />
                    </div>
                  )}

                  {/* Completed Output Drawer */}
                  {isDone && isOpen && job.result && (
                    <div className="mt-5 pt-5 border-t border-slate-100 grid md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                          9:16 Master Export ({job.result.duration})
                        </p>
                        <video
                          src={job.result.output_url}
                          controls
                          className="w-full max-h-[420px] rounded-xl bg-black object-contain"
                        />
                        <div className="flex gap-2 mt-3">
                          <a
                            href={job.result.output_url}
                            download
                            className="flex-1 text-center px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition"
                          >
                            Download 9:16 Master
                          </a>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {job.result.clips && job.result.clips.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                              AI Viral Shorts
                            </p>
                            <div className="space-y-2">
                              {job.result.clips.map((clip, i) => (
                                <div
                                  key={i}
                                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 truncate">
                                      {clip.title}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                      {clip.start}s – {clip.end}s • "{clip.caption}"
                                    </p>
                                  </div>
                                  <a
                                    href={clip.url}
                                    download
                                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg shrink-0"
                                  >
                                    Download
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {job.result.social_copy && (
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                            <p className="text-xs font-semibold text-slate-700 mb-1">
                              {job.result.social_copy.title}
                            </p>
                            <p className="text-xs text-slate-600 mb-2">
                              {job.result.social_copy.description}
                            </p>
                            <p className="text-[11px] font-medium text-violet-600">
                              {(job.result.social_copy.hashtags || []).join(" ")}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
