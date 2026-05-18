"use client";

import { useEffect, useState } from "react";
import { Shield, Check, X, Sparkles, Filter, Clock } from "lucide-react";
import { useActiveUniverse } from "@/contexts/active-universe";
import { useApp } from "@/contexts/app-context";

interface Validation {
  id: string;
  entity_type: string;
  entity_id: string;
  state: string;
  validation_notes: string | null;
  generated_by: string | null;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string;
}

export default function ValidationsPage() {
  const { activeUniverse } = useActiveUniverse();
  const { activeGroup } = useApp();
  const [validations, setValidations] = useState<Validation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadValidations();
  }, [activeUniverse?.id, activeGroup?.id, filter]);

  async function loadValidations() {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("state", filter);
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (activeGroup) params.set("group_id", activeGroup.id);
      const url = `/api/lore-validations${params.toString() ? "?" + params.toString() : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setValidations(data.validations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleValidate(id: string, state: "validated" | "rejected") {
    setProcessing(id);
    try {
      await fetch("/api/lore-validations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: validations.find((v) => v.id === id)?.entity_type,
          entityId: validations.find((v) => v.id === id)?.entity_id,
          state,
          validationNotes: `User ${state} on ${new Date().toLocaleString()}`,
        }),
      });
      await loadValidations();
    } finally {
      setProcessing(null);
    }
  }

  function getStateBadge(state: string) {
    switch (state) {
      case "validated":
        return <span className="rounded-full bg-success/10 px-2 py-0.5 text-xxs text-success">Validated</span>;
      case "rejected":
        return <span className="rounded-full bg-error/10 px-2 py-0.5 text-xxs text-error">Rejected</span>;
      case "under_review":
        return <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xxs text-warning">Under Review</span>;
      default:
        return <span className="rounded-full bg-text-muted/10 px-2 py-0.5 text-xxs text-text-muted">Unverified</span>;
    }
  }

  const states = ["all", "generated_unverified", "under_review", "validated", "rejected"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Lore Validation</h1>
          <p className="mt-1 text-xs text-text-muted">Review and validate AI-generated lore</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-text-muted" />
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLoading(true);
            }}
            className="rounded-lg border border-border-default bg-bg-raised px-2 py-1.5 text-xs text-text-primary"
          >
            {states.map((state) => (
              <option key={state} value={state}>
                {state === "all" ? "All" : state.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading validations...</span>
        </div>
      ) : validations.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
          <Shield className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">No validations</h3>
          <p className="mt-1 text-xs text-text-muted">
            AI-generated lore will appear here for review
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {validations.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-xl border border-border-default bg-bg-elevated p-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                  <Shield className="h-4 w-4 text-text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {v.entity_type}: {v.entity_id}
                  </p>
                  <div className="flex items-center gap-2 text-xxs text-text-muted mt-0.5">
                    {getStateBadge(v.state)}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                    {v.generated_by && <span>by {v.generated_by}</span>}
                  </div>
                </div>
              </div>
              {v.state === "generated_unverified" || v.state === "under_review" ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleValidate(v.id, "validated")}
                    disabled={processing === v.id}
                    className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Validate
                  </button>
                  <button
                    onClick={() => handleValidate(v.id, "rejected")}
                    disabled={processing === v.id}
                    className="flex items-center gap-1 rounded-lg bg-error/10 px-3 py-1.5 text-xs font-medium text-error hover:bg-error/20 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              ) : (
                <span className="text-xxs text-text-muted">
                  {v.validated_by ? `Reviewed by ${v.validated_by}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
