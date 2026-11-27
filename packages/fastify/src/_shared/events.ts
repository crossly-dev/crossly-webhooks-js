// GENERATED from shared/events.ts by scripts/sync-shared.mjs. Do not edit here:
// edit shared/events.ts and run `npm run sync`.
/**
 * Crossly webhook event types.
 *
 * The event names are the catalog published at https://crossly.net/docs/api-webhooks
 * ("Event catalog"), which is generated from the list every dispatch call site in
 * the Crossly API is typed against. The `data` shapes are the documented payloads
 * on the same page. Events whose payload is not documented field by field are typed
 * as `UnknownEventData` rather than guessed at.
 *
 * Deliveries are at-least-once: dedupe on `event.id` (the same across retries and
 * redeliveries), log the `Crossly-Delivery-Id` header.
 *
 * New event types can ship without a code change on your side, so always keep a
 * `default:` branch in your switch.
 */

/** Every event name Crossly sends, in catalog order. */
export const CROSSLY_EVENT_TYPES = [
  // Sales
  'sale.detected',
  'order.created',
  'order.address_available',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'refund.issued',
  'order.refunded',
  'return.requested',
  'return.resolved',
  'order.tracking_requested',
  'order.cancel_requested',
  'order.refund_requested',
  'order.message_requested',
  // Listings
  'listing.created',
  'listing.price_changed',
  'listing.delisted',
  'listing.linked',
  'listing.unlinked',
  'listing.updated',
  'listing.delist_requested',
  'listing.update_requested',
  'listing.relist_requested',
  'listing.command_expired',
  'command.expired',
  'command.cancelled',
  // Inventory
  'inventory.quantity_changed',
  // Offers
  'offer.received',
  'offer.accepted',
  'offer.declined',
  'offer.countered',
  // Messages
  'message.received',
  // Account
  'connection.disconnected',
  'automation.failed',
  'vault.alert',
  // World
  'world.sale',
  'stall.booked',
  'space.event_starting',
  'drop.won',
  'auction.lot_sold',
  'room.visit_digest',
  'appraisal.answered',
  'world.hunt_finished',
  'world.trial_record',
  // Builders
  'game.reviewed',
  'game.reward_granted',
  'game.published',
  'game.played',
  'game.ended',
  'game.reported',
  'contest.entered',
  'contest.settled',
  'contest.prize_won',
  'capability.reviewed',
  'capability.declared',
  'capability.revoked',
  'capability.used',
  'experience.subject_erased',
  'experience.reported',
  'experience.moderated',
  'world.purchase',
  'world.subscription_renewed',
  'world.receipt_refunded',
  'world.payout_sent',
  'world.alert',
  'world.rewards_credited',
  'app.certification_decided',
  'app.verification_decided',
  // The "Send test" button's synthetic delivery; reaches every endpoint.
  'test.ping',
] as const;

export type CrosslyEventType = (typeof CROSSLY_EVENT_TYPES)[number];

const KNOWN = new Set<string>(CROSSLY_EVENT_TYPES);

/** True when `type` is an event name in the published catalog. */
export function isCrosslyEventType(type: string): type is CrosslyEventType {
  return KNOWN.has(type);
}

/** A payload the docs do not spell out field by field. */
export type UnknownEventData = Record<string, unknown>;

/** Money in these payloads is decimal DOLLARS as JSON numbers, unless a field says `Cents`. */
export interface Address {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
}

export interface OrderLineItem {
  lineKey: string | null;
  listingId: string | null;
  inventoryItemId: string | null;
  platformListingId: string | null;
  sku: string | null;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SaleDetectedData {
  saleId: string;
  orderId: string | null;
  inventoryItemId: string | null;
  platform: string;
  platformOrderId: string | null;
  salePrice: number | null;
  platformFee: number | null;
  netProfit?: number | null;
  detectedBy?: string;
  quantity?: number;
  lineItems?: OrderLineItem[];
  [key: string]: unknown;
}

export interface OrderCreatedData {
  orderId: string;
  saleId: string | null;
  platform: string;
  platformOrderId: string | null;
  salePrice: number | null;
  platformFee: number | null;
  buyerUsername?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  buyerAddress?: Address | null;
  /** True when the marketplace has not handed over the address yet; wait for `order.address_available`. */
  addressPending: boolean;
  inventoryItemId: string | null;
  listingId: string | null;
  sku: string | null;
  quantity: number;
  lineItems: OrderLineItem[];
  status?: string;
  [key: string]: unknown;
}

export interface OrderAddressAvailableData {
  orderId: string;
  saleId: string | null;
  platform: string;
  platformOrderId: string | null;
  listingId?: string | null;
  inventoryItemId?: string | null;
  quantity?: number;
  buyerName: string | null;
  buyerPhone: string | null;
  buyerAddress: Address | null;
  addressPending: boolean;
  timestamp?: string;
  [key: string]: unknown;
}

export interface OrderShippedData {
  orderId: string;
  platform: string;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string;
  [key: string]: unknown;
}

export interface OrderDeliveredData {
  orderId: string;
  platform: string;
  deliveredAt: string;
  [key: string]: unknown;
}

export interface OrderCancelledData {
  orderId: string;
  platform: string;
  reason: string | null;
  /** True when Crossly cancelled on the marketplace; false when it was closed locally only. */
  platformCancel: boolean;
  [key: string]: unknown;
}

export interface RefundIssuedData {
  orderId: string;
  platform: string;
  amount: number;
  reason: string | null;
  refundedAt: string;
  [key: string]: unknown;
}

export interface OrderRefundedData {
  orderId: string;
  refundId: string;
  platform: string;
  platformRefundId: string | null;
  amount: number;
  /** Running total across every refund on the order. */
  totalRefunded: number;
  /** Nothing is left to refund. */
  full: boolean;
  reason: string | null;
  lineItems?: Array<{ orderId: string; quantity: number }>;
  source?: string;
  [key: string]: unknown;
}

export interface ReturnRequestedData {
  returnId: string;
  orderId: string;
  purchaseId?: string | null;
  platform: string;
  reason: string;
  buyerNote: string | null;
  photoUrls: string[];
  [key: string]: unknown;
}

export interface ReturnResolvedData {
  returnId: string;
  orderId: string;
  purchaseId?: string | null;
  platform: string;
  reason: string;
  outcome: 'refunded' | 'partially_refunded' | 'no_refund' | 'withdrawn' | (string & {});
  refundedAmount: number | null;
  [key: string]: unknown;
}

export interface ListingCreatedData {
  listingId: string;
  inventoryItemId: string | null;
  platform: string;
  platformListingId: string | null;
  platformListingUrl: string | null;
  [key: string]: unknown;
}

export interface ListingPriceChangedData {
  listingId: string;
  /** Null when the listing had no price before. */
  oldPrice: number | null;
  newPrice: number;
  changedAt: string;
  [key: string]: unknown;
}

export interface ListingDelistedData {
  listingId: string;
  platformListingDbId: string;
  platform: string;
  reason: string | null;
  /** `requested` when Crossly removed it, `marketplace` when the marketplace reported it gone. */
  source: 'requested' | 'marketplace' | (string & {});
  [key: string]: unknown;
}

export interface ListingLinkedData {
  listingId: string;
  platform: string;
  externalId: string;
  channel: 'direct' | 'relayed' | (string & {});
  crosslyShopFeeBps: number;
  at: string;
  [key: string]: unknown;
}

export interface ListingUnlinkedData {
  listingId: string;
  platform: string | null;
  externalId: string | null;
  unlinkedBy: 'seller' | 'app' | (string & {});
  cancelledCommands: number;
  at: string;
  [key: string]: unknown;
}

export interface ListingUpdatedData {
  listingId: string;
  platform: string;
  externalId: string;
  changes: Record<string, unknown>;
  at: string;
  [key: string]: unknown;
}

/** A command to the managing app. Acknowledge with POST /v1/listing-commands/{id}/ack, then complete or fail it. */
export interface AppCommand {
  id: string;
  type: string;
  state: 'pending' | 'acked' | 'completed' | 'failed' | 'expired' | 'cancelled' | (string & {});
  listingId: string | null;
  platform: string | null;
  externalId: string | null;
  orderId?: string | null;
  platformOrderId?: string | null;
  payload: Record<string, unknown>;
  reason: string | null;
  createdAt: string;
  ackedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  [key: string]: unknown;
}

export interface AppCommandData {
  command: AppCommand;
  at: string;
  [key: string]: unknown;
}

export interface InventoryQuantityChangedData {
  inventoryItemId: string;
  sku: string | null;
  quantity: number;
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
  soldOut: boolean;
  reason: string;
  orderId?: string | null;
  saleId?: string | null;
  platform?: string | null;
  changedAt: string;
  [key: string]: unknown;
}

export interface OfferData {
  offerId: string;
  platform: string;
  /** Null when the offer arrived on a listing Crossly has not polled in yet. */
  listingId: string | null;
  buyerHandle: string | null;
  offerCents: number;
  receivedAt?: string;
  /** Only on `offer.countered`. */
  counterCents?: number;
  reason?: string | null;
  automated?: boolean;
  [key: string]: unknown;
}

export interface MessageReceivedData {
  conversationId: string;
  platform: string;
  buyerUsername: string | null;
  messageBody: string;
  [key: string]: unknown;
}

export interface ConnectionDisconnectedData {
  platform: string;
  accountSlot: number;
  reason: string;
  detectedAt: string;
  [key: string]: unknown;
}

export interface AutomationFailedData {
  ruleId: string;
  ruleName: string;
  actionId: string;
  error: string;
  consecutiveFailures: number;
  [key: string]: unknown;
}

export interface TestPingData {
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

/** The `data` payload for each event name. */
export interface CrosslyEventDataMap {
  'sale.detected': SaleDetectedData;
  'order.created': OrderCreatedData;
  'order.address_available': OrderAddressAvailableData;
  'order.shipped': OrderShippedData;
  'order.delivered': OrderDeliveredData;
  'order.cancelled': OrderCancelledData;
  'refund.issued': RefundIssuedData;
  'order.refunded': OrderRefundedData;
  'return.requested': ReturnRequestedData;
  'return.resolved': ReturnResolvedData;
  'order.tracking_requested': AppCommandData;
  'order.cancel_requested': AppCommandData;
  'order.refund_requested': AppCommandData;
  'order.message_requested': AppCommandData;
  'listing.created': ListingCreatedData;
  'listing.price_changed': ListingPriceChangedData;
  'listing.delisted': ListingDelistedData;
  'listing.linked': ListingLinkedData;
  'listing.unlinked': ListingUnlinkedData;
  'listing.updated': ListingUpdatedData;
  'listing.delist_requested': AppCommandData;
  'listing.update_requested': AppCommandData;
  'listing.relist_requested': AppCommandData;
  'listing.command_expired': AppCommandData;
  'command.expired': AppCommandData;
  'command.cancelled': AppCommandData;
  'inventory.quantity_changed': InventoryQuantityChangedData;
  'offer.received': OfferData;
  'offer.accepted': OfferData;
  'offer.declined': OfferData;
  'offer.countered': OfferData;
  'message.received': MessageReceivedData;
  'connection.disconnected': ConnectionDisconnectedData;
  'automation.failed': AutomationFailedData;
  'test.ping': TestPingData;
}

export type CrosslyEventData<T extends CrosslyEventType> = T extends keyof CrosslyEventDataMap
  ? CrosslyEventDataMap[T]
  : UnknownEventData;

/** The delivery envelope for one event name. */
export interface CrosslyEventOf<T extends CrosslyEventType> {
  /** Event id: the same for every subscriber and on every retry. Dedupe on this. */
  id: string;
  type: T;
  /** ISO-8601. */
  created: string;
  data: CrosslyEventData<T>;
  /** Present and true on samples sent by POST /v1/webhooks/{id}/test. */
  test?: boolean;
}

/** Any Crossly event, discriminated on `type`. `switch (event.type)` narrows `event.data`. */
export type CrosslyEvent = { [T in CrosslyEventType]: CrosslyEventOf<T> }[CrosslyEventType];
