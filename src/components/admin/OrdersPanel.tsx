"use client";

import React from "react";
import type { BedConfig } from "@/types/admin";
import type { OrderJobRecipe, OrderRecord, OrderStatus } from "@/types/orders";
import type { ProductTemplate } from "@/types/productTemplate";
import { ORDER_STATUS_LABELS } from "@/types/orders";
import { loadOrders, saveOrders } from "@/utils/orderState";
import styles from "./OrdersPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  assetNames: string[];
  selectedTemplate: ProductTemplate | null;
  currentJobRecipe: OrderJobRecipe | null;
  onLoadOrder: (order: OrderRecord) => void;
}

type NewOrderDraft = {
  customerName: string;
  engravingText: string;
  powerSpeedNotes: string;
};

const EMPTY_DRAFT: NewOrderDraft = { customerName: "", engravingText: "", powerSpeedNotes: "" };

function describeJobRecipe(jobRecipe: OrderJobRecipe | undefined): string | null {
  if (!jobRecipe) return null;

  const placedItems = jobRecipe.placedItems ?? [];
  const assetIds = jobRecipe.assetIds ?? [];
  const details: string[] = [];
  if (placedItems.length > 0) {
    details.push(`${placedItems.length} placed item${placedItems.length === 1 ? "" : "s"}`);
  } else if (assetIds.length > 0) {
    details.push(`${assetIds.length} staged asset${assetIds.length === 1 ? "" : "s"}`);
  }
  if (jobRecipe.materialLabel) {
    details.push(jobRecipe.materialLabel);
  }
  if (jobRecipe.rotaryAutoPlacementEnabled) {
    details.push(jobRecipe.rotaryPresetName ?? "Rotary auto");
  }

  return details.length > 0 ? details.join(" · ") : null;
}

export function OrdersPanel({
  bedConfig,
  assetNames,
  selectedTemplate,
  currentJobRecipe,
  onLoadOrder,
}: Props) {
  const [orders, setOrders] = React.useState<OrderRecord[]>(() => loadOrders());
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<NewOrderDraft>(EMPTY_DRAFT);
  const [open, setOpen] = React.useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const persist = (next: OrderRecord[]) => {
    setOrders(next);
    saveOrders(next);
  };

  const createOrder = () => {
    if (!draft.customerName.trim()) return;
    const order: OrderRecord = {
      id: `order-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      customerName: draft.customerName.trim(),
      engravingText: draft.engravingText.trim() || undefined,
      tumblerBrand: bedConfig.tumblerBrand,
      tumblerModel: bedConfig.tumblerModel,
      tumblerProfileId: bedConfig.tumblerProfileId,
      assetNames: [...assetNames],
      assignedTemplateId: selectedTemplate?.id,
      assignedTemplateName: selectedTemplate?.name,
      jobRecipe: currentJobRecipe ?? undefined,
      bedConfigSnapshot: { ...bedConfig },
      powerSpeedNotes: draft.powerSpeedNotes.trim() || undefined,
      status: "pending",
    };
    const next = [order, ...orders];
    persist(next);
    setCreating(false);
    setDraft(EMPTY_DRAFT);
    setExpandedId(order.id);
  };

  const updateStatus = (id: string, status: OrderStatus) => {
    const next = orders.map((o) =>
      o.id !== id ? o : {
        ...o,
        status,
        ...(status === "proofSent" && !o.proofSentAt
          ? { proofSentAt: new Date().toISOString() }
          : {}),
      }
    );
    persist(next);
  };

  const deleteOrder = (id: string) => {
    persist(orders.filter((o) => o.id !== id));
    if (expandedId === id) setExpandedId(null);
    setConfirmDeleteId(null);
  };

  const csvInputRef = React.useRef<HTMLInputElement>(null);

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // Skip header row if first cell looks like a label (non-numeric, no special chars)
      const dataLines = /^[a-zA-Z\s_]+$/.test(lines[0]?.split(",")[0] ?? "") ? lines.slice(1) : lines;
      const newOrders: OrderRecord[] = dataLines.map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const [customerName = "", engravingText = "", powerSpeedNotes = ""] = cols;
        return {
          id: `order-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          createdAt: new Date().toISOString(),
          customerName: customerName || "Unknown",
          engravingText: engravingText || undefined,
          tumblerBrand: bedConfig.tumblerBrand,
          tumblerModel: bedConfig.tumblerModel,
          tumblerProfileId: bedConfig.tumblerProfileId,
          assetNames: [...assetNames],
          assignedTemplateId: selectedTemplate?.id,
          assignedTemplateName: selectedTemplate?.name,
          jobRecipe: currentJobRecipe ?? undefined,
          bedConfigSnapshot: { ...bedConfig },
          powerSpeedNotes: powerSpeedNotes || undefined,
          status: "pending" as const,
        };
      }).filter((o) => o.customerName !== "Unknown" || dataLines.length === 1);
      if (newOrders.length > 0) {
        const next = [...newOrders, ...orders];
        persist(next);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const isTumbler = bedConfig.workspaceMode === "tumbler-wrap";
  const activeCount = orders.filter(
    (o) => o.status !== "complete" && o.status !== "cancelled"
  ).length;

  return (
    <div className={styles.panel}>
      <button
        className={styles.sectionToggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        type="button"
      >
        <span className={styles.sectionToggleLabel}>
          Orders
          {activeCount > 0 && <span className={styles.badge}>{activeCount}</span>}
        </span>
        <span className={styles.sectionToggleChevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {creating ? (
            <div className={styles.newForm}>
              <input
                className={styles.textInput}
                placeholder="Customer name *"
                value={draft.customerName}
                onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") createOrder(); if (e.key === "Escape") { setCreating(false); setDraft(EMPTY_DRAFT); } }}
                autoFocus
              />
              <input
                className={styles.textInput}
                placeholder="Engraving text (optional)"
                value={draft.engravingText}
                onChange={(e) => setDraft((d) => ({ ...d, engravingText: e.target.value }))}
              />
              <input
                className={styles.textInput}
                placeholder="Power/speed notes (optional)"
                value={draft.powerSpeedNotes}
                onChange={(e) => setDraft((d) => ({ ...d, powerSpeedNotes: e.target.value }))}
              />
              {isTumbler && bedConfig.tumblerBrand && (
                <div className={styles.snapshotPreview}>
                  {bedConfig.tumblerBrand} {bedConfig.tumblerModel ?? ""} · {bedConfig.width.toFixed(0)}×{bedConfig.height.toFixed(0)}mm
                </div>
              )}
              {selectedTemplate && (
                <div className={styles.snapshotPreview}>
                  Template: {selectedTemplate.name}
                </div>
              )}
              {currentJobRecipe && describeJobRecipe(currentJobRecipe) && (
                <div className={styles.snapshotPreview}>
                  Recipe: {describeJobRecipe(currentJobRecipe)}
                </div>
              )}
              {assetNames.length > 0 && (
                <div className={styles.snapshotPreview}>
                  {assetNames.slice(0, 3).join(", ")}{assetNames.length > 3 ? ` +${assetNames.length - 3} more` : ""}
                </div>
              )}
              <div className={styles.formActions}>
                <button
                  className={styles.saveBtn}
                  onClick={createOrder}
                  disabled={!draft.customerName.trim()}
                >
                  Save Order
                </button>
                <button
                  className={styles.cancelBtn}
                  onClick={() => { setCreating(false); setDraft(EMPTY_DRAFT); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.newOrderRow}>
              <button className={styles.newOrderBtn} onClick={() => setCreating(true)}>
                + New Order from Current
              </button>
              <button className={styles.importCsvBtn} onClick={() => csvInputRef.current?.click()} title="Import orders from CSV (columns: customerName, engravingText, powerSpeedNotes)">
                CSV
              </button>
              <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleCsvImport} />
            </div>
          )}

          {orders.length === 0 && !creating && (
            <div className={styles.empty}>No orders yet. Set up your workspace then save an order.</div>
          )}

          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              expanded={expandedId === order.id}
              confirmDelete={confirmDeleteId === order.id}
              onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
              onStatusChange={(s) => updateStatus(order.id, s)}
              onLoadSettings={() => { onLoadOrder(order); setExpandedId(null); }}
              onRequestDelete={() => setConfirmDeleteId(order.id)}
              onConfirmDelete={() => deleteOrder(order.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order card
// ---------------------------------------------------------------------------

function OrderCard({
  order, expanded, confirmDelete,
  onToggle, onStatusChange, onLoadSettings,
  onRequestDelete, onConfirmDelete, onCancelDelete,
}: {
  order: OrderRecord;
  expanded: boolean;
  confirmDelete: boolean;
  onToggle: () => void;
  onStatusChange: (s: OrderStatus) => void;
  onLoadSettings: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className={`${styles.card} ${expanded ? styles.cardExpanded : ""}`}>
      <button className={styles.cardHeader} onClick={onToggle} type="button">
        <div className={styles.cardSummary}>
          <span className={styles.customerName}>{order.customerName}</span>
          {order.engravingText && (
            <span className={styles.engravingText}>&ldquo;{order.engravingText}&rdquo;</span>
          )}
        </div>
        <div className={styles.cardMeta}>
          <StatusBadge status={order.status} />
          <span className={styles.cardDate}>{fmtDate(order.createdAt)}</span>
        </div>
      </button>

      {expanded && (
        <div className={styles.cardBody}>
          {(order.tumblerBrand || order.tumblerModel) && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Tumbler</span>
              <span className={styles.detailValue}>{order.tumblerBrand} {order.tumblerModel}</span>
            </div>
          )}
          {order.assignedTemplateName && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Template</span>
              <span className={styles.detailValue}>{order.assignedTemplateName}</span>
            </div>
          )}
          {describeJobRecipe(order.jobRecipe) && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Recipe</span>
              <span className={styles.detailValue}>{describeJobRecipe(order.jobRecipe)}</span>
            </div>
          )}
          {order.assetNames.length > 0 && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Assets</span>
              <span className={styles.detailValue}>
                {order.assetNames.slice(0, 3).join(", ")}
                {order.assetNames.length > 3 ? ` +${order.assetNames.length - 3}` : ""}
              </span>
            </div>
          )}
          {order.powerSpeedNotes && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Settings</span>
              <span className={styles.detailValue}>{order.powerSpeedNotes}</span>
            </div>
          )}
          {order.proofSentAt && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Proof sent</span>
              <span className={styles.detailValue}>{fmtDate(order.proofSentAt)}</span>
            </div>
          )}

          <div className={styles.statusRow}>
            <span className={styles.detailLabel}>Status</span>
            <select
              className={styles.statusSelect}
              value={order.status}
              onChange={(e) => onStatusChange(e.target.value as OrderStatus)}
            >
              {(Object.entries(ORDER_STATUS_LABELS) as [OrderStatus, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className={styles.cardActions}>
            <button
              className={styles.loadBtn}
              onClick={onLoadSettings}
              title="Load the saved setup for this order"
            >
              Set Up
            </button>
            {confirmDelete ? (
              <>
                <button className={styles.confirmYes} onClick={onConfirmDelete}>Delete</button>
                <button className={styles.confirmNo} onClick={onCancelDelete}>Keep</button>
              </>
            ) : (
              <button className={styles.deleteBtn} onClick={onRequestDelete}>Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#888",
  proofSent: "#e8c46a",
  approved: "#6ab0e8",
  inProgress: "#f97316",
  complete: "#7ecfa8",
  cancelled: "#555",
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className={styles.statusBadge}
      style={{ color, borderColor: color }}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
