import { useCallback, useDebugValue, useEffect, useMemo, useState } from "react";
import type { OrderRecord } from "@/types/orders";
import {
  activateQueueOrder,
  getNextQueueOrder,
  getQueueRunnerActiveOrder,
  getQueueRunnerActiveOrderId,
  getRunnableOrders,
  loadOrders,
  markQueueOrderComplete,
  ORDER_STATE_CHANGED_EVENT,
} from "@/utils/orderState";

interface UseQueueRunnerStateParams {
  onLoadOrder: (order: OrderRecord) => void;
}

function getQueueStateSnapshot() {
  const orders = loadOrders();
  const nextRunnableOrders = getRunnableOrders(orders);
  const activeOrderId = getQueueRunnerActiveOrderId();
  const nextActiveOrder = getQueueRunnerActiveOrder(orders, activeOrderId);

  return {
    queuedJobCount: nextRunnableOrders.length,
    runnableOrders: nextRunnableOrders,
    activeQueueOrder: nextActiveOrder,
  };
}

export function useQueueRunnerState({ onLoadOrder }: UseQueueRunnerStateParams) {
  const [queueState, setQueueState] = useState(getQueueStateSnapshot);
  const { queuedJobCount, runnableOrders, activeQueueOrder } = queueState;

  useDebugValue({
    queuedJobCount,
    runnableOrderCount: runnableOrders.length,
    activeQueueOrderId: activeQueueOrder?.id ?? null,
  });

  const syncQueueState = useCallback(() => {
    setQueueState(getQueueStateSnapshot());
  }, []);

  useEffect(() => {
    const handleOrderStateChanged = () => syncQueueState();
    window.addEventListener("storage", handleOrderStateChanged);
    window.addEventListener("focus", handleOrderStateChanged);
    window.addEventListener(ORDER_STATE_CHANGED_EVENT, handleOrderStateChanged);
    return () => {
      window.removeEventListener("storage", handleOrderStateChanged);
      window.removeEventListener("focus", handleOrderStateChanged);
      window.removeEventListener(ORDER_STATE_CHANGED_EVENT, handleOrderStateChanged);
    };
  }, [syncQueueState]);

  const handleActivateQueuedOrder = useCallback((order: OrderRecord) => {
    onLoadOrder(order);
    activateQueueOrder(order.id);
    syncQueueState();
  }, [onLoadOrder, syncQueueState]);

  const handleLoadNextQueuedOrder = useCallback(() => {
    const orders = loadOrders();
    const activeOrderId = getQueueRunnerActiveOrderId();
    const nextOrder = getNextQueueOrder(orders, activeOrderId);
    if (!nextOrder) return;
    handleActivateQueuedOrder(nextOrder);
  }, [handleActivateQueuedOrder]);

  const handleReopenCurrentQueuedJob = useCallback(() => {
    if (activeQueueOrder) {
      onLoadOrder(activeQueueOrder);
      return;
    }
    handleLoadNextQueuedOrder();
  }, [activeQueueOrder, handleLoadNextQueuedOrder, onLoadOrder]);

  const handleDoneAndLoadNextQueuedOrder = useCallback(() => {
    if (!activeQueueOrder) {
      handleLoadNextQueuedOrder();
      return;
    }

    markQueueOrderComplete(activeQueueOrder.id);
    const nextOrder = getNextQueueOrder(loadOrders(), activeQueueOrder.id);
    if (nextOrder) {
      handleActivateQueuedOrder(nextOrder);
    } else {
      syncQueueState();
    }
  }, [activeQueueOrder, handleActivateQueuedOrder, handleLoadNextQueuedOrder, syncQueueState]);

  const handleCompleteQueuedOrder = useCallback((orderId: string) => {
    markQueueOrderComplete(orderId);
    syncQueueState();
  }, [syncQueueState]);

  const currentJobProductLabel = useMemo(() => (
    activeQueueOrder
      ? activeQueueOrder.assignedTemplateName
        || [activeQueueOrder.tumblerBrand, activeQueueOrder.tumblerModel].filter(Boolean).join(" ")
        || ""
      : ""
  ), [activeQueueOrder]);

  return {
    queuedJobCount,
    runnableOrders,
    activeQueueOrder,
    currentJobProductLabel,
    handleActivateQueuedOrder,
    handleLoadNextQueuedOrder,
    handleReopenCurrentQueuedJob,
    handleDoneAndLoadNextQueuedOrder,
    handleCompleteQueuedOrder,
  };
}
