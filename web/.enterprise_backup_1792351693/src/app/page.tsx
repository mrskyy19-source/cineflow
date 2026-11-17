import Link from "next/link";

export default function Home() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-4xl font-bold md:text-6xl">CineFlow</h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        From wrap to viral in 90 seconds. Upload your footage and let AI
        handle the post-production.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}
