
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
}

export interface BillRow {
    description: string;
    price: string;
    quantity: string;
    amount: string;
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

    // ✅ ADD THIS
    gst?: number; // only for products
    totalSittings?: number; // only for services

  priceType?: string;
  notes?: string;
  brand?: string;
  subcategory?: string;
  source?: 'catalog-service' | 'catalog-product' | 'manual';
}

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
    };
  }
}

