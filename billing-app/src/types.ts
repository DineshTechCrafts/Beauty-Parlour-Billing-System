
export interface BillItem {
  id: number;
  description: string;
  price: number;
  quantity: number;
  amount: number;

  category: string;
  type?: string;

  gst?: number;
  discount?: number;

  grossAmount?: number;    // Pre-discount amount (for bill display)
  discountAmount?: number; // Discount amount applied (for bill display)

  /**
   * Catalog enforcement metadata ensures dropdown selections map back to
   * canonical IDs while still supporting legacy manual rows when editing
   * historical bills.
   */
  catalogId?: string;
  mode?: 'catalog' | 'manual';
  priceType?: string;
  notes?: string;

  totalSittings?: number;
  completedSittings?: number;

    paymentMode?: 'full' | 'per_sitting';

  sacHsnCode?: string;
  unit?: string;
}

export interface BillRow {
    description: string;
    price: string;
    quantity: string;
    amount: string;
    grossAmount?: string;    // Pre-discount amount stored for display
    discountAmount?: string; // Discount amount stored for display
    totalSittings?: string;  // Total sessions for a service (used to compute per-session price)
    sacHsnCode?: string;
    unit?: string;
}

export interface Bill {
    id: string;
    date: string;
    clientName: string;
    clientPhone: string;
    clientAddress: string;
  serviceTotal?: string;
  productTotal?: string;
    subTotal: string;
    discount: string;
  taxableAmount?: string;
    cgst: string;
    sgst: string;
  gstTotal?: string;
  gstRate?: string;
    total: string;
    items: BillRow[];

  placeOfSupply?: string;
  serviceDiscount?: string;
  productDiscount?: string;
}

export interface Customer {
  key: string;
  name: string;
  phone: string;
  bills: Bill[];
  totalSpent: number;
  visitCount: number;
}

export interface ElectronAPI {
    getInventory: () => Promise<{ success: boolean; data: InventoryItem[] | null }>;
    saveInventory: (data: InventoryItem[]) => Promise<{ success: boolean }>;
    getBills: () => Promise<{ success: boolean; data: string | null }>;
    saveBill: (bill: unknown) => Promise<{ success: boolean; error?: string }>;
    getNextBillId: () => Promise<{ success: boolean; data: number }>;
    savePdf: (filename: string) => Promise<{ success: boolean; path?: string }>;
    getSessions: () => Promise<{ success: boolean; data: Record<string, unknown> }>;
    saveSessions: (data: Record<string, unknown>) => Promise<{ success: boolean }>;
}

export interface InventoryItem {
    id: string;
    type: string;
    category: string;
    description: string;
    price: number;
    quantity?: number;

    gst?: number;
    totalSittings?: number;

    priceType?: string;
    notes?: string;
    brand?: string;
    subcategory?: string;
    source?: 'catalog-service' | 'catalog-product' | 'manual';

    sacHsnCode?: string;
    unit?: string;
    mrp?: number;
}

export interface TaxInvoice {
  gst_seq: number;
  receipt_id: string;
  date: string;
  client_name: string;
  client_phone: string;
  client_address: string;
  sub_total: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst_total: number;
  taxable_amount: number;
  service_total: number;
  product_total: number;
  total: number;
  gst_rate: number;
  billing_mode: string;
  place_of_supply: string;
  buyer_gstin: string;
  buyer_legal_name: string;
  buyer_state_code: string;
  reverse_charge: string;
  invoice_type: string;
  item_description: string;
  price: number;
  quantity: number;
  amount: number;
  sac_hsn_code: string;
  unit: string;
  source_receipt_id: string;
  source_line_id: string;
}

// ── Billing system (billing.json) ──────────────────────────────────────────

export interface BillingItemPayload {
  catalogId: string;
  description: string;
  type: 'PRODUCT' | 'SERVICE';
  price: number;       // per-unit pre-tax price (rupees)
  discount: number;    // per-unit discount in rupees (not %)
  gstRate: number;     // percent
  sacHsnCode: string;
  unit: string;
  qty: number;         // number of unit-rows to expand
}

export interface ProcessPaymentPayload {
  customerId: string;  // phone::name
  address: string;
  stateCode: string;
  items: BillingItemPayload[];
  payment: number | null;
  billReceiptFirst: boolean;
}

export interface CustomerBillingInfo {
  outstanding: number;
  advance_credit: number;
  current_receipt_base: number | null;
  next_receipt_id: string | null;
  address: string;
  state_code: string;
}

export interface ReceiptQueueItem {
  line_id: string;
  receipt_id: string;
  product_code: string;
  item_description: string;
  taxed_total: number;
  status: 'PENDING' | 'INVOICED' | 'CANCELLED';
  date: string;
}

export interface CustomerQueueResult {
  success: boolean;
  items?: ReceiptQueueItem[];
  outstanding?: number;
  advance_credit?: number;
  error?: string;
}

export interface ProcessPaymentResult {
  success: boolean;
  receiptId?: string;
  mode?: string;
  gstSeq?: number | null;
  outstanding?: number;
  advanceCredit?: number;
  error?: string;
}

// ── Extended ElectronAPI ────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI: {
      savePdf: (filename: string) => Promise<any>;
      saveBill: (data: any) => Promise<any>;
      getInventory: () => Promise<any>;
      saveInventory: (data: any) => Promise<any>;
      getBills: () => Promise<any>;
      getNextBillId: () => Promise<any>;
      getSessions: () => Promise<any>;
      saveSessions: (data: any) => Promise<any>;
      // Billing system
      billingInit: () => Promise<{ success: boolean; error?: string }>;
      billingProcessPayment: (payload: ProcessPaymentPayload) => Promise<ProcessPaymentResult>;
      billingStartNewSeries: (customerId: string) => Promise<{ success: boolean; newBase?: number; error?: string }>;
      billingGetCustomerInfo: (customerId: string) => Promise<{ success: boolean; data?: CustomerBillingInfo; error?: string }>;
      billingGetCustomerQueue: (customerId: string) => Promise<CustomerQueueResult>;
      billingGetCustomerList: () => Promise<{ success: boolean; customers?: Array<{ customerId: string; phone: string; name: string; visitCount: number; totalSpent: number; lastReceiptDate: string | null }>; error?: string }>;
      billingCancelPendingItems: (payload: { customerId: string; lineIds: string[] }) => Promise<{ success: boolean; cancelled?: number; outstanding?: number; advance_credit?: number; error?: string }>;
      billingRefundCredit: (payload: { customerId: string; amount: number; note?: string }) => Promise<{ success: boolean; refunded?: number; advance_credit?: number; error?: string }>;
      billingGetTaxInvoices: () => Promise<{ success: boolean; data?: TaxInvoice[]; error?: string }>;
    };
  }
}

