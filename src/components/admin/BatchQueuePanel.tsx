"use client";

import React from "react";
import type { BedConfig } from "@/types/admin";
import type { OrderRecord } from "@/types/orders";
import { ORDER_STATUS_LABELS } from "@/types/orders";
import styles from "./BatchQueuePanel.module.css";

const ORDERS_KEY = "lt316_orders";
const ACTIVE_STATUSES = new Set(["pending", "approved", "inProgress"]);

function loadOrders(): OrderRecord[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as OrderRecord[]) : [];
  } catch { return []; }
}

function groupKey(order: OrderRecord): string {
  const brand = order.tumblerBrand?.trim() || "Unknown Brand";
  const model = order.tumblerModel?.trim() || "Unknown Model";
  return `${brand} — ${model}`;
}

interface ModelGroup {
  key: string;
  brand: string;
  model: string;
  profileId: string | undefined;
  orders: OrderRecord[];
}

function buildGroups(orders: OrderRecord[]): ModelGroup[] {
  const active = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
  const map = new Map<string, ModelGroup>();

  for (const order of active) {
    const key = groupKey(order);
    if (!map.has(key)) {
      map.set(key, {
        key,
        brand: order.tumblerBrand || "Unknown Brand",
        model: order.tumblerModel || "Unknown Model",
        profileId: order.tumblerProfileId,
        orders: [],
      });
    }
    map.get(key)!.orders.push(order);
  }

  return Array.from(map.values());
}

interface Props {
  onLoadOrder: (bedConfig: BedConfig) => void;
}

export function BatchQueuePanel({ onLoadOrder }: Props) {
  const [groups, setGroups] = React.useState<ModelGroup[]>([]);
  const [open, setOpen] = React.useState(true);
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    setGroups(buildGroups(loadOrders()));
  }, [open]); // re-read when panel opens

  const totalActive = groups.reduce((sum, g) => sum + g.orders.length, 0);

  const handleLoadGroup = (group: ModelGroup) => {
    const first = group.orders[0];
    if (!first) return;
    onLoadOrder(first.bedConfigSnapshot);
    setLoadedKey(group.key);
  };

  return (
    <div className={styles.panel}>
      <button
        className={styles.toggle}
        onClick={() => setOpen((o) => !o)}
        type="button"
        aria-expanded={open}
      >
        <span className={styles.toggleLabel}>
          Batch Queue
          {totalActive > 0 && (
            <span className={styles.countBadge}>{totalActive}</span>
          )}
        </span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {groups.length === 0 && (
            <div className={styles.empty}>
              No active orders. Create orders in the Orders panel to build a batch queue.
            </div>
          )}

          {groups.map((group, idx) => {
            const isLoaded = loadedKey === group.key;
            const isExpanded = expandedKey === group.key;
            const prevGroup = idx > 0 ? groups[idx - 1] : null;
            const needsSetupChange =
              prevGroup !== null && prevGroup.profileId !== group.profileId;

            return (
              <div key={group.key} className={styles.groupCard}>
                {needsSetupChange && (
                  <div className={styles.setupChangeWarning}>
                    ⚠ Rotary reconfiguration needed
                  </div>
                )}

                <div className={styles.groupHeader}>
                  <div className={styles.groupMeta}>
                    <span className={styles.groupName}>{group.brand}</span>
                    <span className={styles.groupModel}>{group.model}</span>
                    <span className={styles.groupCount}>{group.orders.length} order{group.orders.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className={styles.groupActions}>
                    <button
                      className={`${styles.loadBtn} ${isLoaded ? styles.loadBtnLoaded : ""}`}
                      onClick={() => handleLoadGroup(group)}
                      title="Load this group's settings into the workspace"
                    >
                      {isLoaded ? "✓ Loaded" : "Load"}
                    </button>
                    <button
                      className={styles.expandBtn}
                      onClick={() => setExpandedKey(isExpanded ? null : group.key)}
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className={styles.orderList}>
                    {group.orders.map((order) => (
                      <div key={order.id} className={styles.orderRow}>
                        <span className={styles.orderName}>{order.customerName}</span>
                        {order.engravingText && (
                          <span className={styles.orderText}>&ldquo;{order.engravingText}&rdquo;</span>
                        )}
                        <span className={`${styles.orderStatus} ${styles[`status_${order.status}`]}`}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {groups.length > 1 && (
            <div className={styles.summary}>
              {groups.length} model groups · {
                groups.filter((_, i) => i > 0 && groups[i - 1].profileId !== groups[i].profileId).length
              } setup change{groups.filter((_, i) => i > 0 && groups[i - 1].profileId !== groups[i].profileId).length !== 1 ? "s" : ""} required
            </div>
          )}
        </div>
      )}
    </div>
  );
}
