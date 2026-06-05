
import { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';
import { Sidebar } from './components/Sidebar';
import { BillingTab } from './components/BillingTab';
import { CatalogTab } from './components/CatalogTab';
import { ProductsTab } from './components/ProductsTab';
import { InventoryTab } from './components/InventoryTab';
import { BillHistoryTab } from './components/BillHistoryTab';
import { CustomerTab } from './components/CustomerTab';
import { Toast } from './components/Toast';
import { PrintTemplate } from './components/PrintTemplate';
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
  const [currentBillId, setCurrentBillId] = useState<number>(1);
  const [producedBill, setProducedBill] = useState<Bill | null>(null);
  const [sessions, setSessions] = useState<Record<string, Record<string, { total: number; completed: number }>>>({});

  const [paymentAmount, setPaymentAmount] = useState('');
  const [billReceiptFirst, setBillReceiptFirst] = useState(false);
  const [customerBillingInfo, setCustomerBillingInfo] = useState<CustomerBillingInfo | null>(null);
  const [nextReceiptId, setNextReceiptId] = useState<string | null>(null);

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
    if (window.electronAPI?.getBills) {
      const resp = await window.electronAPI.getBills();
      if (resp && resp.data) {
        const parsedBills = parseAndSetBills(resp.data);
        setCustomers(buildCustomerMap(parsedBills));
      } else {
        setHistoryBills([]);
        setCustomers([]);
      }
    }
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
    if (activeTab === 'history' || activeTab === 'customers') fetchHistory();
    if (activeTab === 'billing') fetchNextBillId();
  }, [activeTab, fetchHistory, fetchNextBillId]);

  const onEditBill = (bill: Bill) => {
    setActiveTab('billing');
    const sequenceMatch = String(bill.id || '').match(/(\d+)$/);
    const parsedSequence = sequenceMatch ? Number(sequenceMatch[1]) : Number(bill.id);
    setCurrentBillId(Number.isFinite(parsedSequence) && parsedSequence > 0 ? parsedSequence : 1);
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

  const buildBillingItems = (): BillingItemPayload[] => {
    const items: BillingItemPayload[] = [];

    for (const item of serviceItems) {
      if (!item.description.trim()) continue;
      const total = Math.max(1, Number(item.totalSittings || 1));
      const visit = Math.max(1, Number(item.completedSittings || 1));
      const qty = Number(item.quantity || 1);
      const fullPrice = Number(item.price || 0);
      const discPct = Number(item.discount || 0);
      const isFullPay = (item.paymentMode || 'per_sitting') === 'full';
      const unitPrice = isFullPay ? fullPrice : (total > 0 ? fullPrice / total : fullPrice);
      const lineQty = isFullPay ? qty : visit * qty;
      const unitDiscount = Math.round((unitPrice * discPct / 100 + Number.EPSILON) * 100) / 100;
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
      const discPct = Number(item.discount || 0);
      const unitDiscount = Math.round((unitPrice * discPct / 100 + Number.EPSILON) * 100) / 100;
      const itemGstRate = applyGST ? (Number(item.gst || 0) || gstRate) : 0;
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
    const normalizedPhone = clientPhone.replace(/\D/g, '');
    if (normalizedPhone.length !== 10) {
      showToast('A valid 10-digit phone number is required', 'error');
      return;
    }
    if (!clientName.trim()) {
      showToast('Client Name is required', 'error');
      return;
    }

    const paymentVal = paymentAmount === '' ? null : Number(paymentAmount);
    const billingItems = buildBillingItems();

    if (billingItems.length === 0 && paymentVal === null) {
      showToast('Please add at least one item or enter a payment amount', 'error');
      return;
    }

    const clientKey = normalizeCustomerKey(normalizedPhone, clientName);

    for (const item of serviceItems) {
      const serviceKey = item.description.trim();
      if (!serviceKey) {
        continue;
      }

      const total = Math.max(1, Number(item.totalSittings || 1));
      const visit = Math.max(1, Number(item.completedSittings || 1));
      const existing = sessions?.[clientKey]?.[serviceKey];

      if (existing) {
        const remaining = Math.max(0, Number(existing.total || total) - Number(existing.completed || 0));
        if (visit > remaining) {
          showToast(`Only ${remaining} sittings left for ${serviceKey}`, 'error');
          return;
        }
      }
    }

    const payload: ProcessPaymentPayload = {
      customerId: clientKey,
      address: clientAddress,
      stateCode: placeOfSupply,
      items: billingItems,
      payment: paymentVal,
      billReceiptFirst,
    };

    try {
      const result = await window.electronAPI.billingProcessPayment(payload);
      if (!result.success) {
        showToast(result.error || 'Failed to process payment', 'error');
        return;
      }

      showToast(`Saved — Receipt ${result.receiptId} (${result.mode})`, 'success');

      if (billingItems.length > 0) {
        const nextSessions: Record<string, Record<string, { total: number; completed: number }>> = JSON.parse(
          JSON.stringify(sessions || {})
        );
        serviceItems.forEach(item => {
          const serviceKey = item.description.trim();
          if (!serviceKey) return;
          const total = Math.max(1, Number(item.totalSittings || 1));
          const visit = Math.max(1, Number(item.completedSittings || 1));
          if (!nextSessions[clientKey]) nextSessions[clientKey] = {};
          if (!nextSessions[clientKey][serviceKey]) nextSessions[clientKey][serviceKey] = { total, completed: 0 };
          nextSessions[clientKey][serviceKey].total = total;
          const updated = Number(nextSessions[clientKey][serviceKey].completed || 0) + visit;
          nextSessions[clientKey][serviceKey].completed = Math.min(total, updated);
        });
        setSessions(nextSessions);
        if (window.electronAPI?.saveSessions) {
          await window.electronAPI.saveSessions(nextSessions);
        }
      }

      await loadCustomerInfo(clientKey);
      setPaymentAmount('');
    } catch {
      showToast('An error occurred during processing', 'error');
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
              {activeTab === 'history' && 'Invoice Archive'}
              {activeTab === 'customers' && 'Customer Intelligence'}
            </h1>
            <p>
              {activeTab === 'billing' && 'Generate professional clinic invoices and manage one-time transactions.'}
              {activeTab === 'catalog' && 'View current service menu and standard pricing definitions.'}
              {activeTab === 'products' && 'Browse all retail products, brands, and pricing available at the clinic.'}
              {activeTab === 'inventory' && 'Maintain retail stock levels and category organization.'}
              {activeTab === 'history' && 'Access past records and track business performance.'}
              {activeTab === 'customers' && 'Search loyalty trends, review visit history, and audit session progress.'}
            </p>
          </header>

          {activeTab === 'billing' && !producedBill && (
            <BillingTab
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
              handleStartNewSeries={handleStartNewSeries}
              nextReceiptId={nextReceiptId}
              customerBillingInfo={customerBillingInfo}
              sessions={sessions}
              customers={customers}
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
          {activeTab === 'customers' && <CustomerTab customers={customers} sessions={sessions} />}
        </div>
      </main>

      {toast && (
        <div className="no-print">
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        </div>
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
