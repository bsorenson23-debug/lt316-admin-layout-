"use client";

import React from "react";
import type { BedConfig } from "@/types/admin";
import { ORDER_STATUS_LABELS, type OrderJobRecipe, type OrderRecord } from "@/types/orders";
import { loadTemplates } from "@/lib/templateStorage";
import { updateOrder } from "@/utils/orderState";
import { ModalDialog } from "./shared/ModalDialog";
import styles from "./JobRunnerOverlay.module.css";

interface Props {
  open: boolean;
  orders: OrderRecord[];
  activeOrderId: string | null;
  onClose: () => void;
  onLoadOrder: (order: OrderRecord) => void;
  onMarkDone: (orderId: string) => void;
  currentTemplateId: string | null;
  currentTemplateName: string | null;
  currentJobRecipe: OrderJobRecipe | null;
  currentBedConfig: BedConfig;
  currentRecipeAssetNames: string[];
  autoRefreshEnabled?: boolean;
}

const TEMPLATE_DRAG_TYPE = "application/x-lt316-template";

function getProductLabel(order: OrderRecord): string {
  const product = [order.tumblerBrand, order.tumblerModel].filter(Boolean).join(" ");
  if (product) return product;
  return order.bedConfigSnapshot.workspaceMode === "tumbler-wrap" ? "Tumbler Job" : "Flat Bed Job";
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatMm(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, "");
}

function getSetupTags(order: OrderRecord): string[] {
  const tags: string[] = [];
  tags.push(order.bedConfigSnapshot.workspaceMode === "tumbler-wrap" ? "Tumbler" : "Flat Bed");
  if (order.bedConfigSnapshot.workspaceMode === "tumbler-wrap" && order.bedConfigSnapshot.tumblerDiameterMm > 0) {
    tags.push(`${formatMm(order.bedConfigSnapshot.tumblerDiameterMm)}mm dia`);
  }
  if (order.tumblerProfileId) {
    tags.push("Profile");
  }
  if (order.jobRecipe) {
    tags.push("Recipe");
  }
  return tags;
}

function getRecipeSummary(order: OrderRecord): string | null {
  if (!order.jobRecipe) return null;

  const placedItems = order.jobRecipe.placedItems ?? [];
  const assetIds = order.jobRecipe.assetIds ?? [];
  const parts: string[] = [];
  if (placedItems.length > 0) {
    parts.push(`${placedItems.length} placed`);
  } else if (assetIds.length > 0) {
    parts.push(`${assetIds.length} staged asset${assetIds.length === 1 ? "" : "s"}`);
  }
  if (order.jobRecipe.materialLabel) {
    parts.push(order.jobRecipe.materialLabel);
  }
  if (order.jobRecipe.rotaryAutoPlacementEnabled) {
    parts.push(order.jobRecipe.rotaryPresetName ?? "Rotary auto");
  }

  return parts.length > 0 ? parts.join(" / ") : "Saved job recipe";
}

function getSetupChangeSummary(order: OrderRecord, activeOrder: OrderRecord | null): string | null {
  if (!activeOrder || activeOrder.id === order.id) return null;

  const changes: string[] = [];
  if (order.bedConfigSnapshot.workspaceMode !== activeOrder.bedConfigSnapshot.workspaceMode) {
    changes.push("mode");
  }
  if ((order.tumblerProfileId ?? "") !== (activeOrder.tumblerProfileId ?? "")) {
    changes.push("profile");
  }
  if (
    Math.abs(
      (order.bedConfigSnapshot.tumblerDiameterMm ?? 0) -
      (activeOrder.bedConfigSnapshot.tumblerDiameterMm ?? 0),
    ) > 0.1
  ) {
    changes.push("diameter");
  }

  return changes.length > 0 ? `Setup change: ${changes.join(" / ")}` : null;
}

function getCurrentWorkspaceSummary(args: {
  templateName: string | null;
  jobRecipe: OrderJobRecipe | null;
  workspaceMode: BedConfig["workspaceMode"];
}): string {
  const parts: string[] = [];
  if (args.templateName) {
    parts.push(args.templateName);
  } else {
    parts.push(args.workspaceMode === "tumbler-wrap" ? "Manual tumbler setup" : "Manual flat-bed setup");
  }

  if (args.jobRecipe?.placedItems.length) {
    parts.push(`${args.jobRecipe.placedItems.length} placed`);
  } else if (args.jobRecipe?.assetIds.length) {
    parts.push(`${args.jobRecipe.assetIds.length} staged asset${args.jobRecipe.assetIds.length === 1 ? "" : "s"}`);
  }

  if (args.jobRecipe?.materialLabel) {
    parts.push(args.jobRecipe.materialLabel);
  }

  return parts.join(" / ");
}

export function JobRunnerOverlay({
  open,
  orders,
  activeOrderId,
  onClose,
  onLoadOrder,
  onMarkDone,
  currentTemplateId,
  currentTemplateName,
  currentJobRecipe,
  currentBedConfig,
  currentRecipeAssetNames,
  autoRefreshEnabled = false,
}: Props) {
  const templates = React.useMemo(() => (open ? loadTemplates() : []), [open]);
  const quickSelectAnchorRef = React.useRef<HTMLParagraphElement>(null);
  const orderCardRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<string[]>([]);
  const [quickSelectOrderId, setQuickSelectOrderId] = React.useState<string | null>(null);
  const activeOrder = orders.find((order) => order.id === activeOrderId) ?? null;
  const canStageCurrentSetup = Boolean(currentTemplateId || currentJobRecipe);
  const currentWorkspaceSummary = getCurrentWorkspaceSummary({
    templateName: currentTemplateName,
    jobRecipe: currentJobRecipe,
    workspaceMode: currentBedConfig.workspaceMode,
  });
  const selectedOrderCount = selectedOrderIds.length;
  const highlightedOrder = quickSelectOrderId
    ? orders.find((order) => order.id === quickSelectOrderId) ?? null
    : null;
  const highlightedCanQuickRefresh = autoRefreshEnabled && Boolean(highlightedOrder?.jobRecipe?.placedItems.length);
  const highlightedOrderIndex = highlightedOrder
    ? orders.findIndex((order) => order.id === highlightedOrder.id)
    : -1;
  const nextHighlightedOrder = highlightedOrderIndex >= 0 && orders.length > 1
    ? orders[(highlightedOrderIndex + 1) % orders.length] ?? null
    : null;
  const nextHighlightedCanQuickRefresh = autoRefreshEnabled && Boolean(nextHighlightedOrder?.jobRecipe?.placedItems.length);

  React.useEffect(() => {
    if (!open) {
      setSelectedOrderIds([]);
      setQuickSelectOrderId(null);
      return;
    }
    setSelectedOrderIds((current) => current.filter((orderId) => orders.some((order) => order.id === orderId)));
  }, [open, orders]);

  React.useEffect(() => {
    if (!open) return;

    setQuickSelectOrderId((current) => {
      if (current && orders.some((order) => order.id === current)) {
        return current;
      }
      if (activeOrderId && orders.some((order) => order.id === activeOrderId)) {
        return activeOrderId;
      }
      return orders[0]?.id ?? null;
    });
  }, [activeOrderId, open, orders]);

  React.useEffect(() => {
    if (!open || !highlightedOrder) return;

    const frameId = window.requestAnimationFrame(() => {
      orderCardRefs.current[highlightedOrder.id]?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [highlightedOrder, open]);

  const getAssignedTemplate = React.useCallback((order: OrderRecord) => (
    templates.find((template) => template.id === order.assignedTemplateId) ?? null
  ), [templates]);

  const handleAssignTemplate = React.useCallback((orderId: string, templateId: string | null) => {
    const template = templateId ? templates.find((entry) => entry.id === templateId) ?? null : null;
    updateOrder(orderId, (order) => ({
      ...order,
      assignedTemplateId: template?.id,
      assignedTemplateName: template?.name,
    }));
  }, [templates]);

  const handleTemplateDragStart = React.useCallback((event: React.DragEvent<HTMLElement>, templateId: string) => {
    event.dataTransfer.setData(TEMPLATE_DRAG_TYPE, templateId);
    event.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleTemplateDrop = React.useCallback((event: React.DragEvent<HTMLElement>, orderId: string) => {
    event.preventDefault();
    const templateId = event.dataTransfer.getData(TEMPLATE_DRAG_TYPE);
    if (!templateId) return;
    handleAssignTemplate(orderId, templateId);
  }, [handleAssignTemplate]);

  const handleStageCurrentSetup = React.useCallback((orderId: string) => {
    if (!canStageCurrentSetup) return;

    updateOrder(orderId, (order) => ({
      ...order,
      assignedTemplateId: currentTemplateId ?? order.assignedTemplateId,
      assignedTemplateName: currentTemplateName ?? order.assignedTemplateName,
      jobRecipe: currentJobRecipe ?? undefined,
      bedConfigSnapshot: currentBedConfig,
      assetNames:
        currentRecipeAssetNames.length > 0
          ? currentRecipeAssetNames
          : order.assetNames,
      tumblerBrand: currentBedConfig.tumblerBrand ?? order.tumblerBrand,
      tumblerModel: currentBedConfig.tumblerModel ?? order.tumblerModel,
      tumblerProfileId: currentBedConfig.tumblerProfileId ?? order.tumblerProfileId,
    }));
  }, [
    canStageCurrentSetup,
    currentBedConfig,
    currentJobRecipe,
    currentRecipeAssetNames,
    currentTemplateId,
    currentTemplateName,
  ]);

  const handleClearRecipe = React.useCallback((orderId: string) => {
    updateOrder(orderId, (order) => ({
      ...order,
      jobRecipe: undefined,
    }));
  }, []);

  const handleToggleOrderSelection = React.useCallback((orderId: string) => {
    setSelectedOrderIds((current) =>
      current.includes(orderId)
        ? current.filter((value) => value !== orderId)
        : [...current, orderId],
    );
  }, []);

  const handleSelectAllOrders = React.useCallback(() => {
    setSelectedOrderIds(orders.map((order) => order.id));
  }, [orders]);

  const handleClearOrderSelection = React.useCallback(() => {
    setSelectedOrderIds([]);
  }, []);

  const handleBulkStageCurrentSetup = React.useCallback(() => {
    if (!canStageCurrentSetup || selectedOrderIds.length === 0) return;
    selectedOrderIds.forEach((orderId) => handleStageCurrentSetup(orderId));
  }, [canStageCurrentSetup, handleStageCurrentSetup, selectedOrderIds]);

  const handleBulkAssignTemplate = React.useCallback(() => {
    if (!selectedTemplateId || selectedOrderIds.length === 0) return;
    selectedOrderIds.forEach((orderId) => handleAssignTemplate(orderId, selectedTemplateId));
  }, [handleAssignTemplate, selectedOrderIds, selectedTemplateId]);

  const handleBulkClearRecipes = React.useCallback(() => {
    if (selectedOrderIds.length === 0) return;
    selectedOrderIds.forEach((orderId) => handleClearRecipe(orderId));
  }, [handleClearRecipe, selectedOrderIds]);

  const handleQuickSelectLoad = React.useCallback(() => {
    if (!highlightedOrder) return;
    onLoadOrder(highlightedOrder);
  }, [highlightedOrder, onLoadOrder]);

  const handleQuickSelectDoneAndNext = React.useCallback(() => {
    if (!highlightedOrder) return;

    const currentIndex = orders.findIndex((order) => order.id === highlightedOrder.id);
    if (currentIndex < 0) return;

    onMarkDone(highlightedOrder.id);

    if (orders.length === 1) {
      setQuickSelectOrderId(null);
      onClose();
      return;
    }

    const nextIndex = currentIndex >= orders.length - 1 ? 0 : currentIndex + 1;
    const nextOrder = orders[nextIndex];
    if (!nextOrder) {
      setQuickSelectOrderId(null);
      onClose();
      return;
    }

    setQuickSelectOrderId(nextOrder.id);
    onLoadOrder(nextOrder);
  }, [highlightedOrder, onClose, onLoadOrder, onMarkDone, orders]);

  React.useEffect(() => {
    if (!open || orders.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          Boolean(target.closest("button, input, textarea, select, a, [role='button']")))
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      const currentIndex = orders.findIndex((order) => order.id === quickSelectOrderId);
      if ((event.key === "ArrowRight" || event.key === "ArrowDown") && orders.length > 0) {
        event.preventDefault();
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % orders.length;
        setQuickSelectOrderId(orders[nextIndex]?.id ?? null);
        return;
      }

      if ((event.key === "ArrowLeft" || event.key === "ArrowUp") && orders.length > 0) {
        event.preventDefault();
        const nextIndex = currentIndex < 0 ? orders.length - 1 : (currentIndex - 1 + orders.length) % orders.length;
        setQuickSelectOrderId(orders[nextIndex]?.id ?? null);
        return;
      }

      if (event.key === "Enter" && quickSelectOrderId) {
        event.preventDefault();
        if (event.shiftKey) {
          handleQuickSelectDoneAndNext();
          return;
        }
        handleQuickSelectLoad();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleQuickSelectDoneAndNext, handleQuickSelectLoad, onClose, open, orders, quickSelectOrderId]);

  if (!open) return null;

  return (
    <ModalDialog
      open={open}
      title="Job Board"
      onClose={onClose}
      size="wide"
      initialFocusRef={orders.length > 0 ? quickSelectAnchorRef : undefined}
    >
      <div className={styles.intro}>
        <div className={styles.kicker}>Job Runner</div>
        <p className={styles.subtitle}>
          {orders.length} runnable job{orders.length === 1 ? "" : "s"}
        </p>
        <p className={styles.helperText}>
          Drag a product template onto a job card to pre-stage setup, then click <strong>{autoRefreshEnabled ? "Set Up + Refresh" : "Set Up"}</strong> to load the right product.
          {autoRefreshEnabled
            ? " Jobs with a saved recipe also refresh the watched LightBurn current-job files immediately."
            : " Saved recipes restore placement before you place artwork."}
        </p>
        {orders.length > 0 ? (
          <p ref={quickSelectAnchorRef} tabIndex={-1} className={styles.quickSelectHint}>
            Quick select: use <strong>Arrow keys</strong> to move across jobs, <strong>Enter</strong> to load, <strong>Shift+Enter</strong> for done and next, and <strong>Esc</strong> to close.
          </p>
        ) : null}
      </div>

      {highlightedOrder ? (
        <div className={styles.quickSelectBar}>
          <div className={styles.quickSelectInfo}>
            <span className={styles.quickSelectLabel}>Highlighted job</span>
            <span className={styles.quickSelectValue}>
              {highlightedOrder.customerName} / {getProductLabel(highlightedOrder)}
            </span>
          </div>
          <div className={styles.quickSelectButtons}>
            <button
              type="button"
              className={styles.bulkActionBtn}
              onClick={handleQuickSelectLoad}
            >
              {highlightedCanQuickRefresh ? "Load Highlighted + Refresh" : "Load Highlighted"}
            </button>
            <button
              type="button"
              className={styles.bulkActionBtnSecondary}
              onClick={handleQuickSelectDoneAndNext}
            >
              {nextHighlightedCanQuickRefresh ? "Done + Next + Refresh" : "Done + Next"}
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.workspaceStageCard}>
        <div className={styles.workspaceStageHeader}>
          <span className={styles.workspaceStageTitle}>Current Workspace</span>
          <span className={styles.workspaceStageState}>
            {canStageCurrentSetup ? "Ready to stage" : "Nothing staged yet"}
          </span>
        </div>
        <div className={styles.workspaceStageValue}>{currentWorkspaceSummary}</div>
        <div className={styles.workspaceStageHint}>
          {canStageCurrentSetup
            ? "Use \"Save Current Setup\" on any job card to replace that job's staged recipe with what is loaded right now."
            : "Load a product or build a layout in the workspace first, then come back here to stage it onto jobs."}
        </div>
        {autoRefreshEnabled ? (
          <div className={styles.workspaceStageSyncNote}>
            Quick-select will refresh the watched <strong>current-job</strong> files when the chosen job has a saved recipe.
          </div>
        ) : null}
      </div>

      <div className={styles.bulkBar}>
        <div className={styles.bulkInfo}>
          <span className={styles.bulkCount}>
            {selectedOrderCount} selected
          </span>
          <button type="button" className={styles.bulkLinkBtn} onClick={handleSelectAllOrders}>
            Select all
          </button>
          <button type="button" className={styles.bulkLinkBtn} onClick={handleClearOrderSelection}>
            Clear
          </button>
        </div>
        <div className={styles.bulkActions}>
          <button
            type="button"
            className={styles.bulkActionBtn}
            onClick={handleBulkAssignTemplate}
            disabled={!selectedTemplateId || selectedOrderCount === 0}
          >
            Apply Selected Template
          </button>
          <button
            type="button"
            className={styles.bulkActionBtn}
            onClick={handleBulkStageCurrentSetup}
            disabled={!canStageCurrentSetup || selectedOrderCount === 0}
          >
            Save Current Setup To Selected
          </button>
          <button
            type="button"
            className={styles.bulkActionBtnSecondary}
            onClick={handleBulkClearRecipes}
            disabled={selectedOrderCount === 0}
          >
            Clear Selected Recipes
          </button>
        </div>
      </div>

      <div className={styles.templateTray}>
        <div className={styles.templateTrayHeader}>
          <span className={styles.templateTrayTitle}>Templates</span>
          <span className={styles.templateTrayHint}>
            Drag onto a job card or click one, then click a job template slot
          </span>
        </div>
        <div className={styles.templateGrid}>
          {templates.map((template) => {
            const isSelected = template.id === selectedTemplateId;
            return (
              <button
                key={template.id}
                type="button"
                draggable
                onDragStart={(event) => handleTemplateDragStart(event, template.id)}
                className={`${styles.templateCard} ${isSelected ? styles.templateCardSelected : ""}`}
                onClick={() => setSelectedTemplateId((current) => current === template.id ? null : template.id)}
              >
                {template.thumbnailDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={template.thumbnailDataUrl} alt="" className={styles.templateThumb} />
                ) : (
                  <div className={styles.templateThumbFallback} aria-hidden="true">
                    {template.productType === "flat" ? "FL" : "TB"}
                  </div>
                )}
                <span className={styles.templateName}>{template.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className={styles.emptyState}>
          No runnable jobs. Create or approve an order to populate the board.
        </div>
      ) : (
        <div className={styles.grid}>
          {orders.map((order) => {
            const isActive = order.id === activeOrderId;
            const isSelected = selectedOrderIds.includes(order.id);
            const isQuickSelected = order.id === quickSelectOrderId;
            const setupChange = getSetupChangeSummary(order, activeOrder);
            const assignedTemplate = getAssignedTemplate(order);
            const recipeSummary = getRecipeSummary(order);
            const canQuickRefresh = autoRefreshEnabled && Boolean(order.jobRecipe?.placedItems.length);
            const loadLabel = isActive
              ? canQuickRefresh
                ? "Reload + Refresh"
                : order.jobRecipe?.placedItems.length
                  ? "Reload Recipe"
                  : "Reload Setup"
              : canQuickRefresh
                ? "Set Up + Refresh"
                : order.jobRecipe?.placedItems.length
                  ? "Set Up Recipe"
                  : "Set Up";

            return (
              <article
                key={order.id}
                ref={(element) => {
                  orderCardRefs.current[order.id] = element;
                }}
                className={`${styles.card} ${isActive ? styles.cardActive : ""} ${isSelected ? styles.cardSelected : ""} ${isQuickSelected ? styles.cardQuickSelected : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleTemplateDrop(event, order.id)}
                onClick={() => setQuickSelectOrderId(order.id)}
              >
                <div className={styles.cardTop}>
                  <div className={styles.identityBlock}>
                    <label className={styles.cardSelect}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleOrderSelection(order.id)}
                      />
                      <span>Select</span>
                    </label>
                    <div className={styles.customer}>{order.customerName}</div>
                    <div className={styles.product}>{getProductLabel(order)}</div>
                  </div>
                  <div className={styles.metaBlock}>
                    <span className={`${styles.statusChip} ${styles[`status_${order.status}`]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    {isActive ? <span className={styles.activeChip}>Current</span> : null}
                  </div>
                </div>

                {order.engravingText ? (
                  <div className={styles.engravingText}>&quot;{order.engravingText}&quot;</div>
                ) : null}

                <div className={styles.tagRow}>
                  {getSetupTags(order).map((tag) => (
                    <span key={`${order.id}-${tag}`} className={styles.setupTag}>
                      {tag}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  className={`${styles.templateDropZone} ${assignedTemplate ? styles.templateDropZoneAssigned : ""}`}
                  onClick={() => {
                    if (selectedTemplateId) {
                      handleAssignTemplate(order.id, selectedTemplateId);
                    }
                  }}
                  onDoubleClick={() => handleAssignTemplate(order.id, null)}
                  title={selectedTemplateId ? "Assign the selected template to this job" : "Drag a template here"}
                >
                  <span className={styles.templateDropLabel}>Assigned template</span>
                  <span className={styles.templateDropValue}>
                    {assignedTemplate?.name ?? order.assignedTemplateName ?? "Drop template here"}
                  </span>
                  <span className={styles.templateDropHint}>
                    {assignedTemplate || order.assignedTemplateName
                      ? "Double-click to clear"
                      : selectedTemplateId
                        ? "Click to assign selected template"
                        : "Drag from the template tray"}
                  </span>
                </button>

                {recipeSummary ? (
                  <div className={styles.recipeNote}>{recipeSummary}</div>
                ) : null}

                {autoRefreshEnabled ? (
                  <div className={canQuickRefresh ? styles.syncReadyNote : styles.syncHintNote}>
                    {canQuickRefresh
                      ? "Quick select refreshes the watched current-job files."
                      : "Save a staged recipe on this job to enable one-click LightBurn refresh."}
                  </div>
                ) : null}

                {setupChange ? <div className={styles.setupWarning}>{setupChange}</div> : null}

                <div className={styles.cardMeta}>
                  <span>{formatCreatedAt(order.createdAt)}</span>
                  <span>{order.assetNames.length} asset{order.assetNames.length === 1 ? "" : "s"}</span>
                </div>

                <div className={styles.recipeActions}>
                  <button
                    type="button"
                    className={styles.recipeActionBtn}
                    onClick={() => handleStageCurrentSetup(order.id)}
                    disabled={!canStageCurrentSetup}
                  >
                    {recipeSummary ? "Replace With Current" : "Save Current Setup"}
                  </button>
                  {order.jobRecipe ? (
                    <button
                      type="button"
                      className={styles.recipeActionBtnSecondary}
                      onClick={() => handleClearRecipe(order.id)}
                    >
                      Clear Recipe
                    </button>
                  ) : null}
                </div>

                <div className={styles.cardActions}>
                  <button className={styles.primaryBtn} onClick={() => onLoadOrder(order)} type="button">
                    {loadLabel}
                  </button>
                  <button className={styles.secondaryBtn} onClick={() => onMarkDone(order.id)} type="button">
                    Mark Done
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </ModalDialog>
  );
}
