import type { OrderRecord, OrderStatus } from "@/types/orders";

export const ORDERS_KEY = "lt316_orders";
export const QUEUE_RUNNER_ACTIVE_ORDER_KEY = "lt316.queueRunner.activeOrderId";
export const ORDER_STATE_CHANGED_EVENT = "lt316:order-state-changed";

export const ACTIVE_ORDER_STATUSES = new Set<OrderStatus>([
  "pending",
  "approved",
  "inProgress",
]);

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function notifyOrderStateChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ORDER_STATE_CHANGED_EVENT));
}

export function loadOrders(storage: Storage | null = getBrowserStorage()): OrderRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as OrderRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveOrders(
  orders: OrderRecord[],
  storage: Storage | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(ORDERS_KEY, JSON.stringify(orders));
    notifyOrderStateChanged();
  } catch {
    // noop
  }
}

export function updateOrder(
  orderId: string,
  mutate: (order: OrderRecord) => OrderRecord,
  storage: Storage | null = getBrowserStorage(),
): OrderRecord[] {
  const next = loadOrders(storage).map((order) =>
    order.id === orderId ? mutate(order) : order,
  );
  saveOrders(next, storage);
  return next;
}

export function getQueueRunnerActiveOrderId(
  storage: Storage | null = getBrowserStorage(),
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(QUEUE_RUNNER_ACTIVE_ORDER_KEY);
  } catch {
    return null;
  }
}

export function setQueueRunnerActiveOrderId(
  orderId: string | null,
  storage: Storage | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    if (orderId) {
      storage.setItem(QUEUE_RUNNER_ACTIVE_ORDER_KEY, orderId);
    } else {
      storage.removeItem(QUEUE_RUNNER_ACTIVE_ORDER_KEY);
    }
    notifyOrderStateChanged();
  } catch {
    // noop
  }
}

function getQueuePriority(status: OrderStatus): number {
  switch (status) {
    case "inProgress":
      return 0;
    case "approved":
      return 1;
    case "pending":
      return 2;
    default:
      return 9;
  }
}

export function getActiveQueueOrders(orders: OrderRecord[]): OrderRecord[] {
  return orders
    .filter((order) => ACTIVE_ORDER_STATUSES.has(order.status))
    .sort((a, b) => {
      const byPriority = getQueuePriority(a.status) - getQueuePriority(b.status);
      if (byPriority !== 0) return byPriority;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function getRunnableOrders(orders: OrderRecord[]): OrderRecord[] {
  return orders
    .filter((order) => order.status !== "complete" && order.status !== "cancelled")
    .sort((a, b) => {
      const byPriority = getQueuePriority(a.status) - getQueuePriority(b.status);
      if (byPriority !== 0) return byPriority;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function getNextQueueOrder(
  orders: OrderRecord[],
  activeOrderId: string | null,
): OrderRecord | null {
  const queueOrders = getRunnableOrders(orders);
  return queueOrders.find((order) => order.id !== activeOrderId) ?? queueOrders[0] ?? null;
}

export function getQueueRunnerActiveOrder(
  orders: OrderRecord[],
  activeOrderId: string | null,
): OrderRecord | null {
  if (!activeOrderId) return null;
  return orders.find((order) => order.id === activeOrderId) ?? null;
}

export function activateQueueOrder(
  orderId: string,
  storage: Storage | null = getBrowserStorage(),
): OrderRecord[] {
  const nextOrders = loadOrders(storage).map((order) => {
    if (order.id === orderId) {
      return order.status === "inProgress" ? order : { ...order, status: "inProgress" as const };
    }
    if (order.status === "inProgress") {
      return { ...order, status: "approved" as const };
    }
    return order;
  });
  saveOrders(nextOrders, storage);
  setQueueRunnerActiveOrderId(orderId, storage);
  return nextOrders;
}

export function markQueueOrderComplete(
  orderId: string,
  storage: Storage | null = getBrowserStorage(),
): OrderRecord[] {
  const nextOrders = loadOrders(storage).map((order) =>
    order.id !== orderId ? order : { ...order, status: "complete" as const },
  );
  saveOrders(nextOrders, storage);
  if (getQueueRunnerActiveOrderId(storage) === orderId) {
    setQueueRunnerActiveOrderId(null, storage);
  }
  return nextOrders;
}
