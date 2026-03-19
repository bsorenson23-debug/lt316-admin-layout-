import type { BedConfig } from "./admin";

export type OrderStatus =
  | "pending"
  | "proofSent"
  | "approved"
  | "inProgress"
  | "complete"
  | "cancelled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  proofSent: "Proof Sent",
  approved: "Approved",
  inProgress: "In Progress",
  complete: "Complete",
  cancelled: "Cancelled",
};

export interface OrderRecord {
  id: string;
  /** ISO timestamp */
  createdAt: string;
  customerName: string;
  engravingText?: string;
  tumblerBrand?: string;
  tumblerModel?: string;
  tumblerProfileId?: string;
  /** Names of SVG assets active at order creation time */
  assetNames: string[];
  /** Full bed config snapshot — used for "Load Settings" */
  bedConfigSnapshot: BedConfig;
  /** Free-text power/speed notes captured at order creation */
  powerSpeedNotes?: string;
  /** ISO timestamp set when status transitions to proofSent */
  proofSentAt?: string;
  status: OrderStatus;
  notes?: string;
}
