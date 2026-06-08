
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './index.css';
import { Sidebar } from './components/Sidebar';
import { BillingTab } from './components/BillingTab';
import { CatalogTab } from './components/CatalogTab';
import { ProductsTab } from './components/ProductsTab';
import { InventoryTab } from './components/InventoryTab';
import { BillHistoryTab } from './components/BillHistoryTab';
import { CustomerTab } from './components/CustomerTab';
import { CustomerLedgerTab } from './components/CustomerLedgerTab';
import { TaxReportTab } from './components/TaxReportTab';
import { Toast } from './components/Toast';
import { PrintTemplate } from './components/PrintTemplate';
import { ReceiptTemplate, ReceiptTemplateProps } from './components/ReceiptTemplate';
import { InventoryItem, Bill, BillItem, BillRow, Customer, CustomerBillingInfo, ProcessPaymentPayload, BillingItemPayload } from './types';
import { INITIAL_CATALOG } from './constants';

const createEmptyServiceItem = (): BillItem => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  description: '',
  category: 'Service',
  type: 'Service',
  price: 0,
  quantity: 1,
  amount: 0,
  totalSittings: 1,
  completedSittings: 1,
  paymentMode: 'per_sitting',
  catalogId: '',
  mode: 'catalog'
});

const normalizeCustomerKey = (phone: string, name: string) => {
  const p = phone.replace(/\D/g, '');
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${p}::${n}`;
};

const formatReceiptId = (receiptId: string): string => {
  const parts = receiptId.trim().split(' ');
  const base = parts[0].padStart(4, '0');
  return parts[1] ? `${base}(${parts[1]})` : base;
};

const formatDDMMYYYY = (isoDate: string): string => {
  const d = new Date(isoDate + (isoDate.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return isoDate;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const buildCustomerMap = (bills: Bill[]): Customer[] => {
  const map = new Map<string, Customer>();

  bills.forEach((bill) => {
    const trimmedName = (bill.clientName || '').trim() || 'Unknown Client';
    const normalizedPhone = (bill.clientPhone || '').replace(/\D/g, '');
    if (!normalizedPhone) return;
    const key = normalizeCustomerKey(normalizedPhone, trimmedName);

    if (!map.has(key)) {
      map.set(key, {
        key,
        name: trimmedName,
        phone: normalizedPhone,
        bills: [],
        totalSpent: 0,
        visitCount: 0
      });
    }

    const customer = map.get(key)!;
    customer.bills.push(bill);

    const parsedTotal = parseFloat(bill.total || '0');
    if (!Number.isNaN(parsedTotal)) {
      customer.totalSpent += parsedTotal;
    }

    customer.visitCount += 1;
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.visitCount !== a.visitCount) {
      return b.visitCount - a.visitCount;
    }
    return b.totalSpent - a.totalSpent;
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState('billing');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');

  const [productItems, setProductItems] = useState<BillItem[]>([]);
  const [serviceItems, setServiceItems] = useState<BillItem[]>([createEmptyServiceItem()]);

  const [applyGST, setApplyGST] = useState(true);
  const [gstRate, setGstRate] = useState(9); // Default 9% CGST & 9% SGST

  const [placeOfSupply, setPlaceOfSupply] = useState('33'); // Tamil Nadu

  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [historyBills, setHistoryBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [_currentBillId, setCurrentBillId] = useState<number>(1);
  const [producedBill, setProducedBill] = useState<Bill | null>(null);
  const [sessions, setSessions] = useState<Record<string, Record<string, { total: number; completed: number }>>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [receiptLevelDiscount, setReceiptLevelDiscount] = useState(0);
  const [receiptDiscountType, setReceiptDiscountType] = useState<'amount' | 'percent'>('percent');
  const [receiptPreviewData, setReceiptPreviewData] = useState<ReceiptTemplateProps | null>(null);
  const [billReceiptFirst, setBillReceiptFirst] = useState(false);
  const [customerBillingInfo, setCustomerBillingInfo] = useState<CustomerBillingInfo | null>(null);
  const [nextReceiptId, setNextReceiptId] = useState<string | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [editingReceiptDate, setEditingReceiptDate] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const parseAmountField = (value?: string) => {
    const parsed = parseFloat(value ?? '');
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const normalizeInventorySource = (items: InventoryItem[]) =>
    items.map(item => ({
      ...item,
      source: item.source || (item.type === 'Product' ? 'catalog-product' : 'catalog-service')
    }));

  const fetchInventory = useCallback(async () => {
    if (window.electronAPI?.getInventory) {
      const resp = await window.electronAPI.getInventory();
      if (resp && resp.data) {
        setInventory(normalizeInventorySource(resp.data as InventoryItem[]));
      } else {
        const fallback = normalizeInventorySource(INITIAL_CATALOG);
        setInventory(fallback);
        window.electronAPI.saveInventory(fallback);
      }
    } else {
      setInventory(normalizeInventorySource(INITIAL_CATALOG));
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    if (window.electronAPI?.getSessions) {
      const resp = await window.electronAPI.getSessions();
      if (resp && resp.success) {
        setSessions((resp.data as Record<string, Record<string, { total: number; completed: number }>>) || {});
      }
    }
  }, []);

  const loadCustomerInfo = useCallback(async (customerId: string) => {
    try {
      const result = await window.electronAPI.billingGetCustomerInfo(customerId);
      if (result.success && result.data) {
        setCustomerBillingInfo(result.data);
        setNextReceiptId(result.data.next_receipt_id);
      } else {
        setCustomerBillingInfo(null);
        setNextReceiptId(null);
      }
    } catch {
      setCustomerBillingInfo(null);
      setNextReceiptId(null);
    }
  }, []);

  const parseAndSetBills = (csvText: string): Bill[] => {
    const parseCSVRow = (str: string) => {
      const result = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (inQuote) {
          if (char === '"') {
            if (str[i + 1] === '"') { cur += '"'; i++; } else { inQuote = false; }
          } else { cur += char; }
        } else {
          if (char === '"') { inQuote = true; }
          else if (char === ',') { result.push(cur); cur = ''; }
          else { cur += char; }
        }
      }
      result.push(cur);
      return result;
    };

    const rows = csvText.trim().split('\n').filter(line => line.trim().length);
    if (rows.length <= 1) {
      setHistoryBills([]);
      return [];
    }

    const headerCols = parseCSVRow(rows[0]).map(col => col.trim());
    const indexOf = (name: string, fallback?: number) => {
      const idx = headerCols.findIndex(col => col.toLowerCase() === name.toLowerCase());
      if (idx !== -1) return idx;
      return typeof fallback === 'number' ? fallback : -1;
    };

    const indexes = {
      billId: indexOf('BillId', 0),
      date: indexOf('Date', 1),
      clientName: indexOf('ClientName', 2),
      clientPhone: indexOf('ClientPhone', 3),
      clientAddress: indexOf('ClientAddress', 4),
      subTotal: indexOf('SubTotal', 5),
      discount: indexOf('Discount', 6),
      cgst: indexOf('CGST', 7),
      sgst: indexOf('SGST', 8),
      total: indexOf('Total', 9),
      itemDescription: indexOf('ItemDescription', 10),
      itemPrice: indexOf('Price', 11),
      itemQuantity: indexOf('Quantity', 12),
      itemAmount: indexOf('Amount', 13),
      serviceTotal: indexOf('ServiceTotal'),
      productTotal: indexOf('ProductTotal'),
      taxableAmount: indexOf('TaxableAmount'),
      gstTotal: indexOf('GSTTotal'),
      gstRate: indexOf('GstRate'),
      placeOfSupply: indexOf('PlaceOfSupply'),
      invoiceType: indexOf('InvoiceType', 26),
    };

    const valueAt = (cols: string[], idx: number) => (idx >= 0 && idx < cols.length ? cols[idx] : '');

    const billsMap = new Map<string, Bill>();
    for (let i = 1; i < rows.length; i++) {
      const cols = parseCSVRow(rows[i]);
      const id = valueAt(cols, indexes.billId);
      if (!id) continue;
      if (!billsMap.has(id)) {
        billsMap.set(id, {
          id,
          date: valueAt(cols, indexes.date),
          clientName: valueAt(cols, indexes.clientName),
          clientPhone: valueAt(cols, indexes.clientPhone),
          clientAddress: valueAt(cols, indexes.clientAddress),
          serviceTotal: valueAt(cols, indexes.serviceTotal),
          productTotal: valueAt(cols, indexes.productTotal),
          subTotal: valueAt(cols, indexes.subTotal),
          discount: valueAt(cols, indexes.discount),
          taxableAmount: valueAt(cols, indexes.taxableAmount),
          cgst: valueAt(cols, indexes.cgst),
          sgst: valueAt(cols, indexes.sgst),
          gstTotal: valueAt(cols, indexes.gstTotal),
          gstRate: valueAt(cols, indexes.gstRate),
          total: valueAt(cols, indexes.total),
          placeOfSupply: valueAt(cols, indexes.placeOfSupply) || undefined,
          invoiceType: valueAt(cols, indexes.invoiceType) || undefined,
          items: []
        });
      }
      const description = valueAt(cols, indexes.itemDescription);
      if (description) {
        billsMap.get(id)!.items.push({
          description,
          price: valueAt(cols, indexes.itemPrice),
          quantity: valueAt(cols, indexes.itemQuantity),
          amount: valueAt(cols, indexes.itemAmount)
        });
      }
    }
    const sorted = Array.from(billsMap.values()).sort((a: Bill, b: Bill) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setHistoryBills(sorted);
    return sorted;
  };

  const fetchHistory = useCallback(async () => {
    let csvCustomers: Customer[] = [];
    if (window.electronAPI?.getBills) {
      const resp = await window.electronAPI.getBills();
      if (resp && resp.data) {
        const parsedBills = parseAndSetBills(resp.data);
        csvCustomers = buildCustomerMap(parsedBills);
      } else {
        setHistoryBills([]);
      }
    }

    // Merge in customers who exist only in billing.json (never generated an invoice to bills.csv)
    if (window.electronAPI?.billingGetCustomerList) {
      try {
        const billingResp = await window.electronAPI.billingGetCustomerList();
        if (billingResp.success && billingResp.customers) {
          const csvKeys = new Set(csvCustomers.map(c => c.key));
          const billingOnly: Customer[] = billingResp.customers
            .filter(c => !csvKeys.has(c.customerId))
            .map(c => ({
              key: c.customerId,
              name: c.name.replace(/\b\w/g, ch => ch.toUpperCase()),
              phone: c.phone,
              bills: [],
              totalSpent: c.totalSpent,
              visitCount: c.visitCount,
            }));
          setCustomers([...csvCustomers, ...billingOnly]);
          return;
        }
      } catch {
        // fall through to csv-only list
      }
    }
    setCustomers(csvCustomers);
  }, []);

  const fetchNextBillId = useCallback(async () => {
    if (window.electronAPI?.getNextBillId) {
      const resp = await window.electronAPI.getNextBillId();
      if (resp && resp.success) {
        setCurrentBillId(resp.data);
      }
    }
  }, []);

  const saveInventory = async (newInventory: InventoryItem[]) => {
    setInventory(newInventory);
    if (window.electronAPI?.saveInventory) {
      await window.electronAPI.saveInventory(newInventory);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchInventory();
      await fetchNextBillId();
      await fetchSessions();
      if (window.electronAPI?.billingInit) {
        await window.electronAPI.billingInit();
      }
    };
    init();
  }, [fetchInventory, fetchNextBillId, fetchSessions]);

  useEffect(() => {
    const normalizedPhone = clientPhone.replace(/\D/g, '');
    if (normalizedPhone.length === 10 && clientName.trim()) {
      loadCustomerInfo(normalizeCustomerKey(normalizedPhone, clientName));
    } else {
      setCustomerBillingInfo(null);
      setNextReceiptId(null);
    }
  }, [clientPhone, clientName, loadCustomerInfo]);

  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'customers' || activeTab === 'billing' || activeTab === 'ledger') fetchHistory();
    if (activeTab === 'billing') fetchNextBillId();
  }, [activeTab, fetchHistory, fetchNextBillId]);

  const onEditBill = (bill: Bill) => {
    setActiveTab('billing');
    setEditingReceiptId(bill.id);
    setEditingReceiptDate(bill.date);
    setPaymentAmount('');
    setBillReceiptFirst(false);
    setClientName(bill.clientName);
    setClientPhone(bill.clientPhone || '');
    setClientAddress(bill.clientAddress || '');
    setPlaceOfSupply(bill.placeOfSupply || '33');

    const stripSessionSuffix = (value: string) => value.replace(/\s*\((\d+\/\d+|Full Payment)\)\s*$/, '').trim();
    const findCatalogItem = (value: string) => {
      const raw = value?.trim().toLowerCase();
      const normalized = stripSessionSuffix(value || '').toLowerCase();
      return inventory.find(inv => {
        const desc = inv.description.trim().toLowerCase();
        return desc === raw || desc === normalized;
      });
    };

    const rProducts: BillItem[] = [];
    const rServices: BillItem[] = [];
    bill.items.forEach((it: BillRow, idx: number) => {
      const catalogMatch = findCatalogItem(it.description || '');
      const isProduct = catalogMatch ? catalogMatch.type === 'Product' : inventory.some(inv => inv.type === 'Product' && inv.description === it.description);
      const builtItem: BillItem = {
        id: Date.now() + idx,
        description: it.description,
        price: Number(it.price),
        quantity: Number(it.quantity),
        amount: Number(it.amount),
        category: catalogMatch?.category || (isProduct ? 'Product' : 'Service'),
        type: catalogMatch?.type || (isProduct ? 'Product' : 'Service'),
        gst: catalogMatch?.gst,
        catalogId: catalogMatch?.id || '',
        mode: catalogMatch ? 'catalog' : 'manual',
        priceType: catalogMatch?.priceType,
        notes: catalogMatch?.notes
      };
      if (isProduct) { rProducts.push(builtItem); } else { rServices.push(builtItem); }
    });
    setProductItems(rProducts);
    setServiceItems(rServices.length > 0 ? rServices : [createEmptyServiceItem()]);
  };

  const buildBillingItems = (receiptDiscountRupees?: number): BillingItemPayload[] => {
    const items: BillingItemPayload[] = [];

    const totalGross = receiptDiscountRupees
      ? [...serviceItems, ...productItems]
          .filter(i => i.description.trim())
          .reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0)
      : 0;

    for (const item of serviceItems) {
      if (!item.description.trim()) continue;
      const total = Math.max(1, Number(item.totalSittings || 1));
      const qty = Number(item.quantity || 1);
      const fullPrice = Number(item.price || 0);
      const unitPrice = total > 0 ? fullPrice / total : fullPrice;
      const lineQty = total * qty;
      let unitDiscount: number;
      if (receiptDiscountRupees && totalGross > 0) {
        const itemGross = fullPrice * qty;
        const share = receiptDiscountRupees * (itemGross / totalGross);
        unitDiscount = Math.round((share / lineQty + Number.EPSILON) * 100) / 100;
      } else {
        const discPct = Number(item.discount || 0);
        unitDiscount = Math.round((unitPrice * discPct / 100 + Number.EPSILON) * 100) / 100;
      }
      items.push({
        catalogId: item.catalogId || '',
        description: item.description.trim(),
        type: 'SERVICE',
        price: Math.round((unitPrice + Number.EPSILON) * 100) / 100,
        discount: unitDiscount,
        gstRate: 0,
        sacHsnCode: item.sacHsnCode || '',
        unit: item.unit || '',
        qty: lineQty,
      });
    }

    for (const item of productItems) {
      if (!item.description.trim()) continue;
      const unitPrice = Number(item.price || 0);
      const qty = Number(item.quantity || 1);
      const itemGstRate = applyGST ? (Number(item.gst || 0) || gstRate) : 0;
      let unitDiscount: number;
      if (receiptDiscountRupees && totalGross > 0) {
        const itemGross = unitPrice * qty;
        const share = receiptDiscountRupees * (itemGross / totalGross);
        unitDiscount = Math.round((share / qty + Number.EPSILON) * 100) / 100;
      } else {
        const discPct = Number(item.discount || 0);
        unitDiscount = Math.round((unitPrice * discPct / 100 + Number.EPSILON) * 100) / 100;
      }
      items.push({
        catalogId: item.catalogId || '',
        description: item.description.trim(),
        type: 'PRODUCT',
        price: Math.round((unitPrice + Number.EPSILON) * 100) / 100,
        discount: unitDiscount,
        gstRate: itemGstRate,
        sacHsnCode: item.sacHsnCode || '',
        unit: item.unit || '',
        qty,
      });
    }

    return items;
  };

  const handleProcessPayment = async () => {
    if (isProcessing) return;
    const normalizedPhone = clientPhone.replace(/\D/g, '');
    if (normalizedPhone.length !== 10) {
      showToast('A valid 10-digit phone number is required', 'error');
      return;
    }
    if (!clientName.trim()) {
      showToast('Client Name is required', 'error');
      return;
    }
    setIsProcessing(true);

    const paymentVal = paymentAmount === '' ? null : Number(paymentAmount);

    // Compute receipt-level discount in rupees (overrides item-level when set)
    const allValidItems = [...serviceItems, ...productItems].filter(i => i.description.trim());
    const totalGross = allValidItems.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
    const receiptDiscRupees = receiptLevelDiscount > 0
      ? (receiptDiscountType === 'percent' ? totalGross * receiptLevelDiscount / 100 : receiptLevelDiscount)
      : 0;

    const billingItems = buildBillingItems(receiptDiscRupees > 0 ? receiptDiscRupees : undefined);

    if (billingItems.length === 0 && paymentVal === null) {
      showToast('Please add at least one item or enter a payment amount', 'error');
      return;
    }

    const clientKey = normalizeCustomerKey(normalizedPhone, clientName);

    // Capture old balance and last receipt reference BEFORE submit
    const oldBalance = customerBillingInfo?.outstanding ?? 0;
    const oldLastReceipt = customerBillingInfo?.last_receipt ?? null;

    const payload: ProcessPaymentPayload = {
      customerId: clientKey,
      address: clientAddress,
      stateCode: placeOfSupply,
      items: billingItems,
      payment: paymentVal,
      billReceiptFirst,
    };

    try {
      let result;
      if (editingReceiptId) {
        result = await window.electronAPI.billingReeditReceipt({
          ...payload,
          receiptId: editingReceiptId,
          receiptDate: editingReceiptDate,
        });
      } else {
        result = await window.electronAPI.billingProcessPayment(payload);
      }
      
      if (!result.success) {
        showToast(result.error || 'Failed to process payment', 'error');
        setIsProcessing(false);
        return;
      }

      // Build receipt preview data from current state
      const validSvc = serviceItems.filter(i => i.description.trim());
      const validPrd = productItems.filter(i => i.description.trim());
      const svcGross = validSvc.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
      const prdGross = validPrd.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
      const totGross = svcGross + prdGross;

      let svcDisc: number, prdDisc: number;
      if (receiptDiscRupees > 0 && totGross > 0) {
        svcDisc = receiptDiscRupees * (svcGross / totGross);
        prdDisc = receiptDiscRupees * (prdGross / totGross);
      } else {
        svcDisc = validSvc.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1) * Number(i.discount || 0) / 100, 0);
        prdDisc = validPrd.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1) * Number(i.discount || 0) / 100, 0);
      }

      const oldBalRef = oldLastReceipt
        ? `BILL:${oldLastReceipt.id.split(' ')[0]}, DATED:${formatDDMMYYYY(oldLastReceipt.date)}`
        : '';

      setReceiptPreviewData({
        billNo: result.receiptId || '',
        billDate: new Date().toISOString().split('T')[0],
        clientName,
        clientPhone: normalizedPhone,
        clientAddress,
        serviceItems: validSvc,
        productItems: validPrd,
        serviceDiscountTotal: svcDisc,
        productDiscountTotal: prdDisc,
        amountPaid: paymentVal,
        oldBalanceAmount: oldBalance,
        oldBalanceBillRef: oldBalRef,
        balanceDue: result.outstanding ?? 0,
      });

      showToast(`Receipt ${result.receiptId} saved`, 'success');
      await Promise.all([loadCustomerInfo(clientKey), fetchHistory()]);
      setPaymentAmount('');
      setReceiptLevelDiscount(0);
    } catch {
      showToast('An error occurred during processing', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartNewSeries = async () => {
    const normalizedPhone = clientPhone.replace(/\D/g, '');
    if (normalizedPhone.length !== 10 || !clientName.trim()) return;
    const clientKey = normalizeCustomerKey(normalizedPhone, clientName);
    try {
      const result = await window.electronAPI.billingStartNewSeries(clientKey);
      if (result.success) {
        showToast('Started new receipt series', 'success');
        await loadCustomerInfo(clientKey);
      } else {
        showToast(result.error || 'Failed to start new series', 'error');
      }
    } catch {
      showToast('Error starting new series', 'error');
    }
  };

  const handleSaveReceiptPdf = async () => {
    if (!receiptPreviewData) return;
    document.body.classList.add('saving-receipt');
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 60));
    const filename = `receipt-${receiptPreviewData.billNo}-${Date.now()}`;
    try {
      const result = await window.electronAPI.saveReceiptPdf(filename);
      if (result.success) {
        showToast('Receipt PDF saved', 'success');
      } else if (!result.cancelled) {
        showToast('Failed to save PDF', 'error');
      }
    } finally {
      document.body.classList.remove('saving-receipt');
    }
  };

  const handlePrintReceipt = () => {
    document.body.classList.add('saving-receipt');
    window.print();
    document.body.classList.remove('saving-receipt');
  };

  // Computed effective discount for BillingTab summary display
  const effectiveSummaryDiscount = useMemo(() => {
    if (receiptLevelDiscount <= 0) return null;
    const gross = [...serviceItems, ...productItems]
      .filter(i => i.description.trim())
      .reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
    return receiptDiscountType === 'percent'
      ? gross * receiptLevelDiscount / 100
      : receiptLevelDiscount;
  }, [receiptLevelDiscount, receiptDiscountType, serviceItems, productItems]);

  const startNewBill = () => {
    setClientName('');
    setClientPhone('');
    setClientAddress('');
    setPlaceOfSupply('33');
    setProductItems([]);
    setServiceItems([createEmptyServiceItem()]);
    setProducedBill(null);
    setPaymentAmount('');
    setBillReceiptFirst(false);
    setCustomerBillingInfo(null);
    setNextReceiptId(null);
    setEditingReceiptId(null);
    setEditingReceiptDate(null);
    setReceiptLevelDiscount(0);
    setReceiptPreviewData(null);
    fetchNextBillId();
  };

  // Print calculations are moved inside the print component or derived only when produced

  const producedServiceItems = producedBill
    ? producedBill.items
        .filter(i => !inventory.find(inv => inv.type === 'Product' && inv.description === i.description))
        .map(i => ({
          ...i,
          id: 0,
          category: 'Service',
          price: Number(i.price),
          quantity: Number(i.quantity),
          amount: Number(i.amount),
          grossAmount: Number(i.grossAmount || i.price),
          discountAmount: Number(i.discountAmount || 0),
          totalSittings: Number(i.totalSittings || 1),
        } as BillItem))
    : [];

  const producedProductItems = producedBill
    ? producedBill.items
        .filter(i => inventory.find(inv => inv.type === 'Product' && inv.description === i.description))
        .map(i => ({
          ...i,
          id: 0,
          category: 'Product',
          price: Number(i.price),
          quantity: Number(i.quantity),
          amount: Number(i.amount),
          grossAmount: Number(i.grossAmount || Number(i.price) * Number(i.quantity)),
          discountAmount: Number(i.discountAmount || 0),
        } as BillItem))
    : [];

  const producedServiceTotalFallback = producedServiceItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const producedProductTotalFallback = producedProductItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const producedSummary = producedBill
    ? (() => {
        const recordedServiceTotal = parseAmountField(producedBill.serviceTotal);
        const recordedProductTotal = parseAmountField(producedBill.productTotal);
        const serviceTotalVal = recordedServiceTotal || producedServiceTotalFallback;
        const productTotalVal = recordedProductTotal || producedProductTotalFallback;
        const recordedSubTotal = parseAmountField(producedBill.subTotal);
        const subTotalVal = recordedSubTotal || serviceTotalVal + productTotalVal;
        const discountVal = parseAmountField(producedBill.discount);
        const taxableVal = parseAmountField(producedBill.taxableAmount) || Math.max(0, subTotalVal - discountVal);
        const cgstVal = parseAmountField(producedBill.cgst);
        const sgstVal = parseAmountField(producedBill.sgst);
        const gstRateVal = parseAmountField(producedBill.gstRate) || ((cgstVal > 0 || sgstVal > 0) ? gstRate : 0);
        const grandTotalVal = parseAmountField(producedBill.total) || Math.max(0, taxableVal + cgstVal + sgstVal);
        return {
          serviceTotal: serviceTotalVal,
          productTotal: productTotalVal,
          subTotal: subTotalVal,
          discount: discountVal,
          taxableAmount: taxableVal,
          cgst: cgstVal,
          sgst: sgstVal,
          gstRatePercent: gstRateVal,
          grandTotal: grandTotalVal
        };
      })()
    : null;

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="main-content">
        <div className="tabs-container">
          <header className="header no-print">
            <h1>
              {activeTab === 'billing' && 'Premium Billing System'}
              {activeTab === 'catalog' && 'Price Catalog Definitions'}
              {activeTab === 'products' && 'Products Menu'}
              {activeTab === 'inventory' && 'Inventory Records'}
              {activeTab === 'history' && 'Receipt Archive'}
              {activeTab === 'customers' && 'Customer Intelligence'}
              {activeTab === 'ledger' && 'Credit Ledger'}
              {activeTab === 'taxreport' && 'Tax Report'}
            </h1>
            <p>
              {activeTab === 'billing' && 'Generate professional clinic invoices and manage one-time transactions.'}
              {activeTab === 'catalog' && 'View current service menu and standard pricing definitions.'}
              {activeTab === 'products' && 'Browse all retail products, brands, and pricing available at the clinic.'}
              {activeTab === 'inventory' && 'Maintain retail stock levels and category organization.'}
              {activeTab === 'history' && 'Access past records and track business performance.'}
              {activeTab === 'customers' && 'Search loyalty trends, review visit history, and audit session progress.'}
              {activeTab === 'ledger' && 'View per-customer payment and invoice history with running credit balance.'}
              {activeTab === 'taxreport' && 'Filter GST invoices by month and year, then export to Excel.'}
            </p>
          </header>

          {activeTab === 'billing' && !producedBill && (
            <BillingTab
              editingReceiptId={editingReceiptId}
              editingReceiptDate={editingReceiptDate}
              clientName={clientName} setClientName={setClientName}
              clientPhone={clientPhone} setClientPhone={setClientPhone}
              clientAddress={clientAddress} setClientAddress={setClientAddress}
              placeOfSupply={placeOfSupply} setPlaceOfSupply={setPlaceOfSupply}
              productItems={productItems} setProductItems={setProductItems}
              serviceItems={serviceItems} setServiceItems={setServiceItems}
              applyGST={applyGST} setApplyGST={setApplyGST}
              gstRate={gstRate} setGstRate={setGstRate}
              paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount}
              billReceiptFirst={billReceiptFirst} setBillReceiptFirst={setBillReceiptFirst}
              inventory={inventory}
              handleProduceBill={handleProcessPayment}
              isProcessing={isProcessing}
              handleStartNewSeries={handleStartNewSeries}
              nextReceiptId={nextReceiptId}
              customerBillingInfo={customerBillingInfo}
              customers={customers}
              receiptLevelDiscount={receiptLevelDiscount}
              setReceiptLevelDiscount={setReceiptLevelDiscount}
              receiptDiscountType={receiptDiscountType}
              setReceiptDiscountType={setReceiptDiscountType}
              effectiveSummaryDiscount={effectiveSummaryDiscount}
            />
          )}

          {activeTab === 'billing' && producedBill && producedSummary && (
            <div className="no-print produced-bill-pane" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <div style={{ color: '#34c759', fontSize: '4rem', marginBottom: '1rem' }}>✓</div>
                  <h2 style={{ marginBottom: '0.5rem' }}>Bill Produced Successfully</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    Invoice <strong>{producedBill.id}</strong> for <strong>{producedBill.clientName}</strong>
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setActiveTab('history')}>
                      View in History
                    </button>
                    <button className="btn btn-primary" onClick={startNewBill}>
                      Create Another Bill
                    </button>
                  </div>
                </div>
              </div>
              <div className="preview-pane" style={{ flex: 1, background: '#fff', padding: '20px', borderRadius: '10px', boxShadow: 'var(--shadow-md)' }}>
                <PrintTemplate
                  clientName={producedBill.clientName}
                  clientPhone={producedBill.clientPhone || ''}
                  clientAddress={producedBill.clientAddress || ''}
                  currentBillId={producedBill.id}
                  billDate={producedBill.date}
                  serviceItems={producedServiceItems}
                  productItems={producedProductItems}
                  serviceDiscountAmount={producedSummary.discount}
                  subTotal={producedSummary.subTotal}
                  taxableAmount={producedSummary.taxableAmount}
                  cgstAmount={producedSummary.cgst}
                  sgstAmount={producedSummary.sgst}
                  gstRatePercent={producedSummary.gstRatePercent}
                  grandTotal={producedSummary.grandTotal}
                />
              </div>
            </div>
          )}

          {activeTab === 'catalog' && <CatalogTab inventory={inventory} />}
          {activeTab === 'products' && <ProductsTab inventory={inventory} />}
          {activeTab === 'inventory' && <InventoryTab inventory={inventory} saveInventory={saveInventory} />}
          {activeTab === 'history' && <BillHistoryTab bills={historyBills} onEdit={onEditBill} />}
          {activeTab === 'customers' && <CustomerTab customers={customers} sessions={sessions} isActive={activeTab === 'customers'} />}
          {activeTab === 'ledger' && <CustomerLedgerTab customers={customers} isActive={activeTab === 'ledger'} />}
          {activeTab === 'taxreport' && <TaxReportTab isActive={activeTab === 'taxreport'} />}
        </div>
      </main>

      {toast && (
        <div className="no-print">
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        </div>
      )}

      {/* Receipt preview modal */}
      {receiptPreviewData && (
        <div
          className="receipt-modal-overlay no-print"
          onClick={e => { if (e.target === e.currentTarget) setReceiptPreviewData(null); }}
        >
          <div className="receipt-modal-box">
            <div className="receipt-modal-header">
              <span className="receipt-modal-title">Receipt Preview — {receiptPreviewData.billNo}</span>
              <button className="receipt-modal-close" onClick={() => setReceiptPreviewData(null)}>×</button>
            </div>
            <div className="receipt-modal-body">
              <ReceiptTemplate {...receiptPreviewData} />
            </div>
            <div className="receipt-modal-footer">
              <button className="btn btn-secondary" onClick={() => setReceiptPreviewData(null)}>Close</button>
              <button className="btn btn-secondary" onClick={handlePrintReceipt}>Print</button>
              <button className="btn btn-primary" onClick={handleSaveReceiptPdf}>Save PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Portal print layer — shown only during saving-receipt */}
      {receiptPreviewData && createPortal(
        <div className="receipt-print-layer">
          <ReceiptTemplate {...receiptPreviewData} />
        </div>,
        document.body
      )}

      {producedBill && producedSummary && (
        <PrintTemplate
          ref={printRef}
          clientName={producedBill.clientName}
          clientPhone={producedBill.clientPhone || ''}
          clientAddress={producedBill.clientAddress || ''}
          currentBillId={producedBill.id}
          billDate={producedBill.date}
          serviceItems={producedServiceItems}
          productItems={producedProductItems}
          serviceDiscountAmount={producedSummary.discount}
          subTotal={producedSummary.subTotal}
          taxableAmount={producedSummary.taxableAmount}
          cgstAmount={producedSummary.cgst}
          sgstAmount={producedSummary.sgst}
          gstRatePercent={producedSummary.gstRatePercent}
          grandTotal={producedSummary.grandTotal}
        />
      )}
    </div>
  );
}
