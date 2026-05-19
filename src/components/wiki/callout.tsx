'use client';

import React, { useState } from 'react';
import {
  Pencil,
  ClipboardList,
  Info,
  CheckCircle2,
  Flame,
  Check,
  HelpCircle,
  AlertTriangle,
  X,
  Zap,
  Bug,
  List,
  Quote,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// Callout type configuration: icon + color classes
const CALLOUT_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; titleColor: string }> = {
  note: {
    icon: Pencil,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500',
    titleColor: 'text-blue-300',
  },
  abstract: {
    icon: ClipboardList,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-l-cyan-500',
    titleColor: 'text-cyan-300',
  },
  info: {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500',
    titleColor: 'text-blue-300',
  },
  todo: {
    icon: CheckCircle2,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500',
    titleColor: 'text-blue-300',
  },
  tip: {
    icon: Flame,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
    titleColor: 'text-amber-300',
  },
  success: {
    icon: Check,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-l-green-500',
    titleColor: 'text-green-300',
  },
  question: {
    icon: HelpCircle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-l-yellow-500',
    titleColor: 'text-yellow-300',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-l-orange-500',
    titleColor: 'text-orange-300',
  },
  failure: {
    icon: X,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-l-red-500',
    titleColor: 'text-red-300',
  },
  danger: {
    icon: Zap,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-l-red-500',
    titleColor: 'text-red-300',
  },
  bug: {
    icon: Bug,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-l-purple-500',
    titleColor: 'text-purple-300',
  },
  example: {
    icon: List,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-l-indigo-500',
    titleColor: 'text-indigo-300',
  },
  quote: {
    icon: Quote,
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-l-gray-500',
    titleColor: 'text-gray-300',
  },
};

// Default config for unknown types
const DEFAULT_CONFIG = CALLOUT_CONFIG.note;

export interface CalloutProps {
  type: string;
  fold?: '+' | '-';
  title?: string;
  children: React.ReactNode;
}

/**
 * Obsidian-style callout component.
 *
 * Features:
 * - 12 callout types with unique icons and colors
 * - Foldable support (+ = default expanded, - = default collapsed)
 * - Custom titles
 * - Nested callout support
 */
export default function Callout({ type, fold, title, children }: CalloutProps) {
  const config = CALLOUT_CONFIG[type.toLowerCase()] || DEFAULT_CONFIG;
  const IconComponent = config.icon;

  // Determine fold state
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (fold === '+') return false; // Default expanded
    if (fold === '-') return true;  // Default collapsed
    return false;                   // No fold = always expanded
  });

  const isFoldable = fold === '+' || fold === '-';

  // Default title is the type name capitalized
  const displayTitle = title || type.charAt(0).toUpperCase() + type.slice(1);

  const handleClick = () => {
    if (isFoldable) {
      setIsCollapsed((prev) => !prev);
    }
  };

  return (
    <div
      className={`callout callout-${type} border-l-4 ${config.border} ${config.bg} rounded-lg p-4 my-4`}
      role="note"
    >
      <div
        className={`callout-title flex items-center gap-2 ${isFoldable ? 'cursor-pointer select-none' : ''}`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (isFoldable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsCollapsed((prev) => !prev);
          }
        }}
        tabIndex={isFoldable ? 0 : undefined}
        role={isFoldable ? 'button' : undefined}
        aria-expanded={isFoldable ? !isCollapsed : undefined}
      >
        <IconComponent size={16} className={`callout-icon ${config.color} shrink-0`} />
        <span className={`callout-title-text font-semibold ${config.titleColor} text-sm`}>
          {displayTitle}
        </span>
        {isFoldable && (
          <span className="callout-fold ml-auto text-text-muted">
            {isCollapsed ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </span>
        )}
      </div>
      {(!isFoldable || !isCollapsed) && (
        <div className="callout-content mt-2 text-text-primary text-sm leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
