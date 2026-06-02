
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

// ─── SQLite DB types ─────────────────────────────────────────────────────────

export interface DbCustomer {
  customer_id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  state_code: string;
}

export type ReceiptMode = 'ITEMS_ONLY' | 'PAYMENT_ONLY' | 'ITEMS_PAYMENT';

export interface DbReceipt {
  receipt_id: string;
  customer_id: string;
  receipt_date: string;
  payment: number | null;
  mode: ReceiptMode;
  bill_receipt_first: number;
  created_at: string;
}

export interface DbReceiptItem {
  item_id: string;
  receipt_id: string;
  customer_id: string;
  item_description: string;
  type: 'PRODUCT' | 'SERVICE';
  price: number;
  quantity: number;
  amount: number;
  discount: number;
  gst_rate: number;
  taxed_total: number;
  sac_hsn_code: string | null;
  unit: string | null;
  status: 'PENDING' | 'INVOICED';
  invoiced_in_seq: number | null;
  receipt_date?: string;
}

export interface NewReceiptItem {
  description: string;
  type: 'PRODUCT' | 'SERVICE';
  price: number;
  quantity: number;
  discount?: number;
  gstRate: number;
  sacHsnCode?: string;
  unit?: string;
}

export interface ProcessPaymentOpts {
  customerId: string;
  receiptDate: string;
  payment?: number | null;
  items?: NewReceiptItem[];
  billReceiptFirst?: boolean;
  invoiceDate?: string;
  sellerStateCode?: string;
}

export interface ProcessPaymentResult {
  receiptId: string;
  mode: ReceiptMode;
  invoiceSeq: number | null;
  covered: string[];
}

export interface DbTaxInvoice {
  row_id: number;
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
  sac_hsn_code: string | null;
  unit: string | null;
  source_receipt_id: string;
  source_item_id: string;
}

export interface DbLedgerEntry {
  txn_id: number;
  customer_id: string;
  type: 'PAYMENT' | 'INVOICE' | 'ADVANCE_CREDIT' | 'CREDIT_USED';
  amount: number;
  ref_id: string | null;
  date: string;
}

export interface GstFilingRow {
  gst_seq: number;
  date: string;
  client_name: string;
  receipt_id: string;
  taxable_amount: number;
  gst_total: number;
  total: number;
  cgst: number;
  sgst: number;
  igst: number;
  billing_mode: string;
  invoice_type: string;
  buyer_gstin: string;
}

// ─── IPC response wrapper ────────────────────────────────────────────────────

export type IpcResponse<T> = { success: true; data: T } | { success: false; error: string };

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

      db: {
        listCustomers: () => Promise<IpcResponse<DbCustomer[]>>;
        getCustomer: (id: string) => Promise<IpcResponse<DbCustomer>>;
        createCustomer: (data: Partial<DbCustomer>) => Promise<IpcResponse<string>>;
        updateCustomer: (id: string, data: Partial<DbCustomer>) => Promise<IpcResponse<void>>;

        processPayment: (opts: ProcessPaymentOpts) => Promise<IpcResponse<ProcessPaymentResult>>;
        listReceipts: (customerId?: string) => Promise<IpcResponse<DbReceipt[]>>;
        getReceiptItems: (receiptId: string) => Promise<IpcResponse<DbReceiptItem[]>>;

        getOutstanding: (customerId: string) => Promise<IpcResponse<number>>;
        getPendingItems: (customerId: string) => Promise<IpcResponse<DbReceiptItem[]>>;
        getAdvanceCredit: (customerId: string) => Promise<IpcResponse<number>>;
        getCustomerLedger: (customerId: string) => Promise<IpcResponse<{ receipts: DbReceipt[]; ledger: DbLedgerEntry[] }>>;

        getGstFiling: () => Promise<IpcResponse<GstFilingRow[]>>;
        getInvoiceLines: (gstSeq: number) => Promise<IpcResponse<DbTaxInvoice[]>>;

        exportCsv: () => Promise<IpcResponse<string>>;
        reconcile: () => Promise<IpcResponse<{ customer_id?: string; gst_seq?: number; error: string }[]>>;
        backup: () => Promise<IpcResponse<string>>;
      };
    };
  }
}

