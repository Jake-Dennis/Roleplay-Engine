'use client';
export default function JobsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8">
      <h2 className="text-xl font-semibold text-red-600">Failed to load jobs</h2>
      <p className="text-gray-600 text-sm">{error.message}</p>
      <button onClick={reset} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Try again</button>
    </div>
  );
}
