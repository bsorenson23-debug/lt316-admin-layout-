"use client";

import React from "react";
import type { OrderRecord } from "@/types/orders";
import { ORDER_STATUS_LABELS } from "@/types/orders";
import {
  activateQueueOrder,
  getActiveQueueOrders,
  getNextQueueOrder,
  getQueueRunnerActiveOrderId,
  loadOrders,
  markQueueOrderComplete,
  saveOrders,
  setQueueRunnerActiveOrderId,
} from "@/utils/orderState";
import styles from "./BatchQueuePanel.module.css";

function groupKey(order: OrderRecord): string {
  const brand = order.tumblerBrand?.trim() || "Unknown Brand";
  const model = order.tumblerModel?.trim() || "Unknown Model";
  return `${brand} - ${model}`;
}

interface ModelGroup {
  key: string;
  brand: string;
  model: string;
  profileId: string | undefined;
  orders: OrderRecord[];
}

function buildGroups(orders: OrderRecord[]): ModelGroup[] {
  const active = getActiveQueueOrders(orders);
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
  onLoadOrder: (order: OrderRecord) => void;
}

export function BatchQueuePanel({ onLoadOrder }: Props) {
  const [orders, setOrders] = React.useState<OrderRecord[]>([]);
  const [groups, setGroups] = React.useState<ModelGroup[]>([]);
  const [open, setOpen] = React.useState(true);
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = React.useState<string | null>(null);

  const syncOrders = React.useCallback(() => {
    const nextOrders = loadOrders();
    const nextActiveOrderId = getQueueRunnerActiveOrderId();
    const nextGroups = buildGroups(nextOrders);
    const nextActiveOrder =
      nextOrders.find((order) => order.id === nextActiveOrderId) ?? null;

    setOrders(nextOrders);
    setGroups(nextGroups);
    setActiveOrderId(nextActiveOrder?.id ?? null);
    setLoadedKey(nextActiveOrder ? groupKey(nextActiveOrder) : null);

    if (nextActiveOrderId && !nextActiveOrder) {
      setQueueRunnerActiveOrderId(null);
    }
  }, []);

  React.useEffect(() => {
    syncOrders();
  }, [open, syncOrders]);

  React.useEffect(() => {
    const handleStorage = () => syncOrders();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleStorage);
    };
  }, [syncOrders]);

  const persistOrders = React.useCallback((nextOrders: OrderRecord[]) => {
    setOrders(nextOrders);
    setGroups(buildGroups(nextOrders));
    saveOrders(nextOrders);
  }, []);

  const queueOrders = React.useMemo(() => getActiveQueueOrders(orders), [orders]);
  const totalActive = queueOrders.length;
  const activeOrder =
    queueOrders.find((order) => order.id === activeOrderId) ?? null;

  const handleLoadSpecificOrder = React.useCallback(
    (order: OrderRecord) => {
      onLoadOrder(order);
      setLoadedKey(groupKey(order));
      setActiveOrderId(order.id);
      activateQueueOrder(order.id);
      syncOrders();
    },
    [onLoadOrder, syncOrders],
  );

  const handleLoadGroup = React.useCallback(
    (group: ModelGroup) => {
      const first = group.orders[0];
      if (!first) return;
      handleLoadSpecificOrder(first);
    },
    [handleLoadSpecificOrder],
  );

  const handleLoadNext = React.useCallback(() => {
    const nextOrder = getNextQueueOrder(orders, activeOrderId);
    if (!nextOrder) return;
    handleLoadSpecificOrder(nextOrder);
  }, [activeOrderId, handleLoadSpecificOrder, orders]);

  const handleMarkDoneAndLoadNext = React.useCallback(() => {
    if (!activeOrder) {
      handleLoadNext();
      return;
    }

    const completedOrders = markQueueOrderComplete(activeOrder.id);

    const remainingQueue = getActiveQueueOrders(completedOrders);
    const nextOrder = remainingQueue[0] ?? null;
    if (!nextOrder) {
      setActiveOrderId(null);
      setLoadedKey(null);
      setQueueRunnerActiveOrderId(null);
      return;
    }

    onLoadOrder(nextOrder);
    setLoadedKey(groupKey(nextOrder));
    setActiveOrderId(nextOrder.id);
    activateQueueOrder(nextOrder.id);
    syncOrders();
  }, [activeOrder, handleLoadNext, onLoadOrder, syncOrders]);

  return (
    <div className={styles.panel}>
      <button
        className={styles.toggle}
        onClick={() => setOpen((value) => !value)}
        type="button"
        aria-expanded={open}
      >
        <span className={styles.toggleLabel}>
          Batch Queue
          {totalActive > 0 && <span className={styles.countBadge}>{totalActive}</span>}
        </span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.runnerCard}>
            <div className={styles.runnerHeader}>
              <span className={styles.runnerTitle}>Job Runner</span>
              <span className={styles.runnerCount}>{queueOrders.length} active</span>
            </div>

            {activeOrder ? (
              <div className={styles.currentJob}>
                <div className={styles.currentName}>{activeOrder.customerName}</div>
                <div className={styles.currentMeta}>
                  {activeOrder.tumblerBrand || "Unknown Brand"} · {activeOrder.tumblerModel || "Unknown Model"}
                </div>
                {activeOrder.engravingText && (
                  <div className={styles.currentText}>&ldquo;{activeOrder.engravingText}&rdquo;</div>
                )}
                <div className={styles.runnerActionRow}>
                  <button
                    className={styles.runnerPrimaryBtn}
                    onClick={handleMarkDoneAndLoadNext}
                    disabled={queueOrders.length === 0}
                  >
                    Done + Next
                  </button>
                  <button
                    className={styles.runnerSecondaryBtn}
                    onClick={() => handleLoadSpecificOrder(activeOrder)}
                  >
                    Reload
                  </button>
                  <button
                    className={styles.runnerSecondaryBtn}
                    onClick={handleLoadNext}
                    disabled={queueOrders.length <= 1}
                  >
                    Skip
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.runnerEmpty}>
                No job loaded. Use <strong>Load Next Job</strong> to pull the first queued order into the workspace.
              </div>
            )}

            <button
              className={styles.runnerLoadBtn}
              onClick={handleLoadNext}
              disabled={queueOrders.length === 0}
            >
              Load Next Job
            </button>
          </div>

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
                    Rotary reconfiguration needed
                  </div>
                )}

                <div className={styles.groupHeader}>
                  <div className={styles.groupMeta}>
                    <span className={styles.groupName}>{group.brand}</span>
                    <span className={styles.groupModel}>{group.model}</span>
                    <span className={styles.groupCount}>
                      {group.orders.length} order{group.orders.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className={styles.groupActions}>
                    <button
                      className={`${styles.loadBtn} ${isLoaded ? styles.loadBtnLoaded : ""}`}
                      onClick={() => handleLoadGroup(group)}
                      title="Load this group's first queued order into the workspace"
                    >
                      {isLoaded ? "Loaded" : "Load"}
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
                        {activeOrderId === order.id && (
                          <span className={styles.orderLoaded}>Loaded</span>
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
              {groups.length} model groups ·{" "}
              {
                groups.filter(
                  (_, i) => i > 0 && groups[i - 1].profileId !== groups[i].profileId,
                ).length
              }{" "}
              setup change
              {groups.filter(
                (_, i) => i > 0 && groups[i - 1].profileId !== groups[i].profileId,
              ).length !== 1
                ? "s"
                : ""}{" "}
              required
            </div>
          )}
        </div>
      )}
    </div>
  );
}
