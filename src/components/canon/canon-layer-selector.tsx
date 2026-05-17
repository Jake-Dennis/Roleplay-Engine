/**
 * CanonLayerSelector Component
 *
 * Dropdown for selecting canon tier (5-tier system) with visual indicators.
 *
 * Usage:
 *   <CanonLayerSelector
 *     value={entity.canon_tier}
 *     onChange={(tier) => updateCanonTier(tier)}
 *     entityType="npc"
 *   />
 */

"use client";

import { useState } from "react";
import { Shield, ChevronDown, Check } from "lucide-react";
import { CANON_TIER_LABELS, CANON_TIER_COLORS } from "@/lib/entity-constants";
import { CANON_TIERS } from "@/lib/canon-tiers";

interface CanonLayerSelectorProps {
  value: string;
  onChange: (tier: string) => void;
  entityType: string;
  disabled?: boolean;
}

export function CanonLayerSelector({
  value,
  onChange,
  entityType,
  disabled = false,
}: CanonLayerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
          CANON_TIER_COLORS[value] || CANON_TIER_COLORS.generated_lore
        } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-bg-raised"}`}
      >
        <Shield className="h-4 w-4" />
        <span>{CANON_TIER_LABELS[value] || value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-text-muted ml-1" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 mt-1 w-64 rounded-lg border border-border-default bg-bg-elevated shadow-xl">
            {CANON_TIERS.map((tier) => {
              const isSelected = tier.value === value;
              return (
                <button
                  key={tier.value}
                  onClick={() => {
                    onChange(tier.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-bg-raised ${
                    isSelected ? "bg-accent/10" : ""
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${CANON_TIER_COLORS[tier.value]}`}>
                      {tier.label}
                    </p>
                    <p className="text-xxs text-text-muted mt-0.5">
                      {tier.description}
                    </p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-accent flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
