'use client';
import { useRef, useState, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import { buildLinkGraph } from '@/lib/wiki/wikilinks';
import type { WikiPage } from '@/lib/wiki/file-io';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, GitBranch, RefreshCw } from 'lucide-react';

interface GraphViewProps {
  pages: WikiPage[];
  basePath?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const NODE_COLORS: Record<string, string> = {
  entity: '#3b82f6',
  concept: '#22c55e',
  source: '#f97316',
  synthesis: '#a855f7',
};

function LoadingState() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        return prev + Math.random() * 15;
      });
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-[500px] border border-border-default rounded-lg flex flex-col items-center justify-center bg-bg-elevated" role="status" aria-label="Building graph">
      <div className="relative mb-4">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
      <p className="text-sm font-medium text-text-primary mb-2">Building graph...</p>
      <div className="w-48 h-1.5 bg-bg-highlight rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-text-muted mt-2">Analyzing connections</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="w-full h-[500px] border border-border-default rounded-lg flex flex-col items-center justify-center bg-bg-elevated" role="status" aria-label="No connections yet">
      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
          <GitBranch size={24} className="text-text-muted" />
        </div>
        {/* Decorative dots */}
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent/30" />
        <div className="absolute -bottom-1 -left-2 w-2 h-2 rounded-full bg-accent/20" />
        <div className="absolute top-2 -left-3 w-2 h-2 rounded-full bg-accent/15" />
      </div>
      <p className="text-sm font-medium text-text-primary mb-1">No connections yet</p>
      <p className="text-xs text-text-muted text-center max-w-xs">
        Ingest source material to build your knowledge graph.
      </p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="w-full h-[500px] border border-border-default rounded-lg flex flex-col items-center justify-center bg-bg-elevated" role="alert" aria-label="Graph failed to render">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
          <AlertTriangle size={20} className="text-error" />
        </div>
      </div>
      <p className="text-sm font-medium text-text-primary mb-1">Graph failed to render</p>
      <p className="text-xs text-text-muted text-center max-w-xs mb-3">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-raised border border-border-default text-text-primary text-xs font-medium hover:bg-bg-highlight transition-colors"
          aria-label="Retry graph rendering"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
      <p className="text-xs text-text-muted mt-3">
        Try refreshing the page or check your wiki data.
      </p>
    </div>
  );
}

export default function GraphView({ pages, basePath = '/wiki', isLoading, error, onRetry }: GraphViewProps) {
  const cyRef = useRef<any>(null);
  const router = useRouter();

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (pages.length === 0) {
    return <EmptyState />;
  }

  const graph = buildLinkGraph(pages);

  const elements = [
    ...pages.map(page => ({
      data: {
        id: page.path,
        label: page.frontmatter.title || page.path.split('/').pop()?.replace('.md', ''),
        type: page.frontmatter.type || 'entity',
      },
    })),
    ...graph.edges.map(edge => ({
      data: { source: edge.source, target: edge.target },
    })),
  ];

  // Map singular frontmatter type to plural folder name used in wiki directory structure
  const typeToFolder: Record<string, string> = {
    entity: 'entities',
    concept: 'concepts',
    source: 'sources',
    synthesis: 'synthesis',
  };

  const handleTap = (event: { target: () => { isNode: () => boolean; id: () => string } }) => {
    const target = event.target();
    if (target.isNode()) {
      const nodeId = target.id();
      const page = pages.find(p => p.path === nodeId);
      if (page) {
        const folderName = typeToFolder[page.frontmatter.type] || page.frontmatter.type;
        router.push(`${basePath}/${folderName}/${page.path.split('/').pop()?.replace('.md', '')}`);
      }
    }
  };

  return (
    <div className="w-full h-[500px] border border-border-default rounded-lg overflow-hidden">
      <CytoscapeComponent
        elements={elements}
        layout={{ name: 'cose', animate: true, padding: 20 }}
        style={{ width: '100%', height: '100%' }}
        cy={(cy) => { cyRef.current = cy; }}
        stylesheet={[
          {
            selector: 'node',
            style: {
              'background-color': (ele: { data: (key: string) => string }) => NODE_COLORS[ele.data('type')] || '#6b7280',
              'label': 'data(label)',
              'font-size': '10px',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'width': '20px',
              'height': '20px',
              'color': '#e8e8e8',
            },
          },
          {
            selector: 'edge',
            style: {
              'width': 1,
              'line-color': '#4b5563',
              'target-arrow-color': '#4b5563',
              'target-arrow-shape': 'none',
              'curve-style': 'bezier',
            },
          },
        ]}
        tap={handleTap}
      />
    </div>
  );
}
