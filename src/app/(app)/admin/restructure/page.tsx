"use client";

import { useState } from "react";
import { Shield, Move, Tags, Merge, Moon } from "lucide-react";
import { BulkMoveTab } from "./tabs/bulk-move-tab";
import { BulkRecategorizeTab } from "./tabs/bulk-recategorize-tab";
import { MergeSuggestionsTab } from "./tabs/merge-suggestions-tab";
import { DormancyTab } from "./tabs/dormancy-tab";

type TabKey = "bulk-move" | "bulk-recategorize" | "merge-suggestions" | "dormancy";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "bulk-move", label: "Bulk Move", icon: <Move className="h-4 w-4" /> },
  { key: "bulk-recategorize", label: "Bulk Re-categorize", icon: <Tags className="h-4 w-4" /> },
  { key: "merge-suggestions", label: "Merge Suggestions", icon: <Merge className="h-4 w-4" /> },
  { key: "dormancy", label: "Dormancy", icon: <Moon className="h-4 w-4" /> },
];

export default function RestructurePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("bulk-move");

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-text-accent" />
            <h1 className="text-lg font-semibold text-text-primary">
              Admin: Restructure
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Bulk operations for wiki page management
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex border-b border-border-default">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-accent text-text-accent"
                : "text-text-muted hover:text-text-secondary hover:border-b-2 hover:border-border-default"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "bulk-move" && <BulkMoveTab />}
      {activeTab === "bulk-recategorize" && <BulkRecategorizeTab />}
      {activeTab === "merge-suggestions" && <MergeSuggestionsTab />}
      {activeTab === "dormancy" && <DormancyTab />}
    </>
  );
}
