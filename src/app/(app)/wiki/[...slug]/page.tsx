'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import FileTree from '@/components/wiki/file-tree';
import BacklinkPanel from '@/components/wiki/backlink-panel';
import MarkdownRenderer from '@/components/wiki/markdown-renderer';
import type { WikiPage } from '@/lib/wiki/file-io';

export default function WikiPageView() {
  const params = useParams();
  const slug = params.slug as string[];
  const [page, setPage] = useState<WikiPage | null>(null);
  const [allPages, setAllPages] = useState<WikiPage[]>([]);
  const [orphanPaths, setOrphanPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pagePath = slug.join('/');
    setLoading(true);
    setError(null);

    fetch(`/api/wiki/${pagePath}`)
      .then(res => {
        if (!res.ok) throw new Error('Page not found');
        return res.json();
      })
      .then(data => {
        setPage(data.page);
        setAllPages(data.allPages || []);
        setOrphanPaths(data.orphanPaths || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  if (loading) return <div className="p-8 text-center text-text-muted">Loading...</div>;
  if (error) return <div className="p-8 text-center text-error">{error}</div>;
  if (!page) return <div className="p-8 text-center text-text-muted">Page not found</div>;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left sidebar */}
      <div className="w-64 border-r border-border-default p-4 overflow-y-auto shrink-0">
        <FileTree pages={allPages} currentPage={page.path} orphanPaths={orphanPaths} />
      </div>

      {/* Main content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <MarkdownRenderer content={page.content} frontmatter={page.frontmatter} />
      </div>

      {/* Right sidebar */}
      <div className="w-64 border-l border-border-default p-4 overflow-y-auto shrink-0">
        <BacklinkPanel currentPage={page.path} allPages={allPages} />
      </div>
    </div>
  );
}
